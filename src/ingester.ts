import {
  VALID_TAXONOMIC_STATUSES,
  acceptedOrUncheckedStatusFilter,
  batcher,
  logDeep,
  normalizeStatus,
  synonymStatusFilter,
} from './support'

import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import parse from 'csv-parse'
import stream from 'stream'
import streamify from 'async-stream-generator'
import util from 'util'

const pipeline = util.promisify(stream.pipeline)
const prisma = new PrismaClient({ log: [/*'query'*/ `warn`, `error`] })

function nameDataFromRecord(record: any, ingestId: string, options?: any) {
  // TODO all rank epithets
  return {
    id: options && options.id ? options.id : null,
    scientific_name: record.scientificName,
    family: record.family,
    genus: record.genus,
    specific_epithet: record.specificEpithet,
    infraspecific_epithet: record.infraspecificEpithet,
    name_authorship: record.scientificNameAuthorship,
    taxon_rank: record.taxonRank.toLowerCase(),
    wfo_name_reference: record.taxonID,
    created_by_wfo_ingest_id: ingestId,
  }
}

async function fetchNames(records: any[]) {
  return await prisma.names.findMany({
    where: {
      wfo_name_reference: {
        in: records.map((record) => record.taxonID),
      },
    },
    include: {
      flora_taxa_names: {
        where: {
          ingest_id: process.env.ACTIVE_INGEST_ID,
        },
      },
    },
  })
}

async function insertMissingNames(
  batch,
  names,
  ingestId: string,
  options: any,
) {
  const insertedNames = []
  for (var record of batch) {
    if (VALID_TAXONOMIC_STATUSES.indexOf(record.taxonomicStatus) === -1) {
      console.error(
        'Record had invalid taxonomic status:',
        record.taxonomicStatus,
        record,
      )
      process.exit(1)
    }

    // If a name doesn't exist already, linked to this wfo-* ID, create it
    if (!names.find((n) => n.wfo_name_reference === record.taxonID)) {
      let insertedName = await prisma.names.create({
        data: nameDataFromRecord(record, ingestId, {
          id: options ? options.uuids.names.shift() : undefined,
        }),
      })
      insertedNames.push(insertedName)
    }
  }
  return insertedNames
}

// For each Accepted/Unchecked record, find the related flora_taxon via flora_taxa_names for the last ingest
// - If the flora_taxon doesn't exist, create it
async function findOrInsertFloraTaxa(
  batch,
  names,
  ingestId: string,
  options: any,
) {
  const filteredBatch = batch.filter(acceptedOrUncheckedStatusFilter)
  const floraTaxa = await prisma.flora_taxa.findMany({
    where: {
      flora_taxa_names: {
        some: {
          status: {
            in: ['accepted', 'unknown'],
          },
          ingest_id: process.env.ACTIVE_INGEST_ID,
          names: {
            wfo_name_reference: {
              in: filteredBatch.map((r) => r.taxonID),
            },
          },
        },
      },
    },
    include: { flora_taxa_names: { include: { names: true } } },
  })
  for (const record of filteredBatch) {
    const foundFloraTaxon = floraTaxa.find((t) =>
      t.flora_taxa_names.find(
        (tn) => tn.names.wfo_name_reference === record.taxonID,
      ),
    )
    let createdFloraTaxon
    if (!foundFloraTaxon) {
      createdFloraTaxon = await prisma.flora_taxa.create({
        data: {
          id: options ? options.uuids.flora_taxa.shift() : undefined,
          created_by_wfo_ingest_id: ingestId,
        },
      })
    }

    await insertFloraTaxaName(
      foundFloraTaxon || createdFloraTaxon,
      names,
      ingestId,
      record,
      options,
    )
  }
}

// - Create a flora_taxa_name for each Accepted/Unchecked name
async function insertFloraTaxaName(
  floraTaxon,
  names,
  ingestId,
  record,
  options,
) {
  const name = names.find((n) => n.wfo_name_reference === record.taxonID)
  let insertedFloraTaxonName = await prisma.flora_taxa_names.create({
    data: {
      id: options ? options.uuids.flora_taxa_names.shift() : undefined,
      flora_taxon_id: floraTaxon.id,
      name_id: name.id,
      status: normalizeStatus(record.taxonomicStatus),
      ingest_id: ingestId,
    },
  })
}

async function insertSynonymFloraTaxaNames(
  filteredBatch,
  names,
  ingestId,
  options,
) {
  // Get the accepted flora_taxa by acceptedNameUsageId
  const acceptedFloraTaxa = await prisma.flora_taxa.findMany({
    where: {
      flora_taxa_names: {
        some: {
          status: {
            in: ['accepted', 'unknown'],
          },
          ingest_id: ingestId,
          names: {
            wfo_name_reference: {
              in: filteredBatch.map((r) => r.acceptedNameUsageID),
            },
          },
        },
      },
    },
    include: { flora_taxa_names: { include: { names: true } } },
  })

  for (var record of filteredBatch) {
    // Insert the flora_taxa_names record
    const floraTaxon = acceptedFloraTaxa.find((t) =>
      t.flora_taxa_names.find(
        (tn) => tn.names.wfo_name_reference === record.acceptedNameUsageID,
      ),
    )

    await insertFloraTaxaName(floraTaxon, names, ingestId, record, options)
  }
}

async function loadClassification(filePath: string) {
  const readStream = fs.createReadStream(filePath)

  const csvParser = parse({
    delimiter: '\t',
    relax: true,
    columns: true,
  })

  await pipeline(readStream, csvParser)

  return streamify(batcher(csvParser, 3))
}

// Sample record format:
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
//}
export async function ingest(
  ingestId: string,
  filePath: string,
  options?: {
    uuids?: {
      names: string[]
      flora_taxa: string[]
      flora_taxa_names: string[]
    }
    disconnectDatabase?: boolean
  },
) {
  options = options || {}
  if (typeof options.disconnectDatabase === 'undefined') {
    options.disconnectDatabase = true
  }
  console.info('Starting WFO ingest with ID ', ingestId)

  // Load the TSV file, parse it, batch the records and make an iterable
  const firstPassBatches = await loadClassification(filePath)

  for await (const batch of firstPassBatches) {
    // Fetch names joined to "current" flora_taxon_names by wfo-* ID
    let existingNames = await fetchNames(batch)

    // For records relating to names that don't exist by wfo-* ID, insert the names
    let createdNames = await insertMissingNames(
      batch,
      existingNames,
      ingestId,
      options,
    )

    // Add flora_taxa and flora_taxa_names for accepted/unchecked records only
    await findOrInsertFloraTaxa(
      batch,
      existingNames.concat(createdNames),
      ingestId,
      options,
    )
  }

  // Load/parse/batch the TSV file again so we can handle synonyms
  // We do this in a second pass so we don't have to keep the whole file in memory
  const secondPassBatches = await loadClassification(filePath)

  // For eacn Synonym, find the name record by wfo-* ID, and look up the accepted flora_taxon by acceptedNameUsageId,
  // then insert the flora_taxa_names record
  for await (const batch of secondPassBatches) {
    let names = await fetchNames(batch)

    await insertSynonymFloraTaxaNames(
      batch.filter(synonymStatusFilter),
      names,
      ingestId,
      options,
    )
  }

  if (options.disconnectDatabase) {
    await prisma.$disconnect()
  }
}
