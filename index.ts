import dotenv from 'dotenv'
dotenv.config()
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient({log: [/*'query',*/ `warn`, `error`]})
import parse from 'csv-parse'
import fs from 'fs'
import stream from 'stream'
import util from 'util'
const pipeline = util.promisify(stream.pipeline)
import streamify from 'async-stream-generator'
import { v4 as uuidv4 } from 'uuid'

async function* batcher(iterable, batchSize = 5) {
  let batch = []
  for await (const chunk of iterable) {
    batch.push(chunk)
    if(batch.length === batchSize || iterable.readableEnded) {
      yield batch
      batch = []
    }
  }
}

const main = async () => {

  console.info('Starting WFO ingest with ID ', INGEST_ID)

  const readStream = fs.createReadStream(`./local-data/classification-11.txt`)

  const csvParser = parse({
    delimiter: '\t',
    relax: true,
    columns: true
  })

  pipeline(readStream, csvParser)

  const batches = streamify(batcher(csvParser, 3))
  
  for await (const batch of batches) {

    // 1) Fetch names joined to "current" flora_taxon_names by wfo-* ID
    const names = await prisma.names.findMany({
      where: {
        wfo_name_reference: {
          in: batch.map(record => record.taxonID)
        }
      },
      include: {
        flora_taxa_names: {
          where: {
            ingest_id: process.env.ACTIVE_INGEST_ID
          }
        }
      }
    })


    for(var record of batch) {


      // 2a) For Accepted records relating to names that don't exist by wfo-* ID, insert them, and insert taxa and flora_taxon_names

      if(record.taxonomicStatus === "Accepted" && !names.find(n => n.wfo_name_reference === record.taxonID)) {
        let insertedName = await prisma.names.create({
          data: nameDataFromRecord(record)
        })

        let insertedTaxon = await prisma.flora_taxa.create({
          data: {
            accepted_name_id: insertedName.id,
            created_by_wfo_ingest_id: INGEST_ID
          }
        })

        let insertedFloraTaxonName = await prisma.flora_taxa_names.create({
          data: {
            flora_taxon_id: insertedTaxon.id,
            name_id: insertedName.id,
            status: normalizeStatus(record.taxonomicStatus),
            ingest_id: INGEST_ID
          }
        })
      }

      // 2b) For non-Accepted records relating to names that don't exist by wfo=* ID, look up the Accepted names
      // 2bi) For those where an Accepted name exists already, insert the names and flora_taxon_names
      // 2bii) For those where an Accepted name doesn't exist already, insert the names and add the Accepted wfo-* ID, current name ID, ingest ID and status to the flora_taxon_names_unmatched table
      // 2c) For records relating to names that DO exist by wfo-* ID, insert only new flora_taxon_names records with name_id, flora_taxon_id from (1) and status from the current record.

      // 3) For Accepted records, check the flora_taxon_names_unmatched table by wfo-* ID and current ingest ID
      // 3a) If a row exists, insert the flora_taxon_id from (1), and the name_id and status from flora_taxon_names_unmatched. Mark the row from flora_taxon_names_unmatched "resolved"



      /*{
        taxonID: 'wfo-0000000003',
        scientificNameID: '57415-2',
        scientificName: 'Chromolaena larensis',
        taxonRank: 'SPECIES',
        parentNameUsageID: 'wfo-4000008153',
        scientificNameAuthorship: '(V.M.Badillo) R.M.King & H.Rob.',
        family: 'Asteraceae',
        genus: 'Chromolaena',
        specificEpithet: 'larensis',
        infraspecificEpithet: '',
        verbatimTaxonRank: '',
        nomenclaturalStatus: '',
        namePublishedIn: 'Phytologia 35 498 1977',
        taxonomicStatus: 'Accepted',
        acceptedNameUsageID: '',
        nameAccordingToID: '',
        created: '2012-02-11',
        modified: '2012-02-11',
        references: 'http://www.theplantlist.org/tpl1.1/record/gcc-100'
      }*/
    }
  }

  await logStats()

  process.exit()

};

const INGEST_ID = uuidv4()

main()

function logDeep(obj) {
  console.log(util.inspect(obj, {showHidden: false, depth: null}))
}

function nameDataFromRecord(record) {
  // TODO all rank epithets
  return {
    scientific_name: record.scientificName,
    family: record.family,
    genus: record.genus,
    specific_epithet: record.specificEpithet,
    infraspecific_epithet: record.infraspecificEpithet,
    name_authorship: record.scientificNameAuthorship,
    taxon_rank: record.taxonRank.toLowerCase(),
    wfo_name_reference: record.taxonID,
    created_by_wfo_ingest_id: INGEST_ID
  }
}

function normalizeStatus(status) {
  if(status === "Accepted") { return "accepted" }
  if(status === "Synonym") { return "synonym" }
  return "unknown"
}

async function logStats() {
  const insertedNamesCount = await prisma.names.count({
    where: {
      created_by_wfo_ingest_id: INGEST_ID
    }
  })

  console.info('Created', insertedNamesCount, 'names')
}