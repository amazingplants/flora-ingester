const BATCH_SIZE = 1000

import {
  VALID_TAXONOMIC_STATUSES,
  acceptedOrUncheckedStatusFilter,
  batcher,
  countLines,
  irrelevantTaxonRanksFilter,
  logDeep,
  normalizedRecordStatus,
  normalizedStatus,
  relevantTaxonRanksFilter,
  synonymStatusFilter,
} from './support'

import { PrismaClient } from '@prisma/client'
import cliProgress from 'cli-progress'
import fs from 'fs'
import parse from 'csv-parse'
import { v4 as uuidv4 } from 'uuid'

const prisma = new PrismaClient(
  process.env.DEBUG
    ? {
        log: [
          {
            emit: 'event',
            level: 'query',
          },
          {
            emit: 'stdout',
            level: 'error',
          },
          {
            emit: 'stdout',
            level: 'warn',
          },
        ],
      }
    : undefined,
)

if (process.env.DEBUG) {
  prisma.$on('query', (e) => {
    console.log('Query: ')
    logDeep(e.query)
    console.log('Params: ' + e.params)
    console.log('Duration: ' + e.duration + 'ms')
  })
}

function nameDataFromRecord(record: any, ingestId: string, options?: any) {
  // TODO all rank epithets
  return {
    id: options && options.id ? options.id : undefined,
    scientific_name: record.scientificName,
    family: record.family,
    genus: record.genus,
    specific_epithet: record.specificEpithet,
    infraspecific_epithet: record.infraspecificEpithet,
    name_authorship: record.scientificNameAuthorship,
    name_published_in: record.namePublishedIn,
    taxon_rank: record.taxonRank.toLowerCase(),
    wfo_name_reference: record.taxonID,
    wfo_data: {
      accepted_name_reference: record.acceptedNameUsageID,
      normalized_status: normalizedRecordStatus(record),
    },
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

async function findAcceptedFloraTaxonRecursive(
  acceptedNameReference,
  depth = 0,
): Promise<any> {
  if (depth >= 3) {
    return null
  }
  let name = await prisma.names.findFirst({
    where: {
      wfo_name_reference: acceptedNameReference,
    },
    include: { flora_taxa_names: { include: { flora_taxa: true } } },
  })
  if (!name) {
    console.error(
      'Could not find accepted name when looking up recursive synonym:',
      acceptedNameReference,
    )
    throw new Error('ERR_ACCEPTED_NAME_NOT_FOUND')
  }
  let status = name.wfo_data['normalized_status']
  if (status === 'synonym') {
    depth++
    return await findAcceptedFloraTaxonRecursive(
      name.wfo_data['accepted_name_reference'],
      depth,
    )
  }
  if (status === 'accepted') {
    const flora_taxa_name = name.flora_taxa_names.find(
      (ftn) => ftn.status === 'accepted',
    )
    return flora_taxa_name ? flora_taxa_name.flora_taxa : null
  }
}

async function insertMissingNames(
  batch,
  names,
  ingestId: string,
  options: any,
) {
  const insertedNames = []
  for (var record of batch) {
    if (
      VALID_TAXONOMIC_STATUSES.indexOf(record.taxonomicStatus.toLowerCase()) ===
      -1
    ) {
      console.error(
        'Record had invalid taxonomic status:',
        record.taxonomicStatus,
        record,
      )
      throw new Error('ERR_INVALID_TAXONOMIC_STATUS')
    }

    // If a name doesn't exist already, linked to this wfo-* ID, create it
    if (!names.find((n) => n.wfo_name_reference === record.taxonID)) {
      let insertedName = nameDataFromRecord(record, ingestId, {
        id: options && options.uuids ? options.uuids.names.shift() : uuidv4(),
      })
      insertedNames.push(insertedName)
    }
  }
  await prisma.names.createMany({ data: insertedNames })
  return insertedNames
}

// For each Accepted/Unchecked record, find the related flora_taxon via flora_taxa_names for the last ingest
// - If the flora_taxon doesn't exist, create it
async function findOrInsertFloraTaxa(
  filteredBatch,
  names,
  ingestId: string,
  options: any,
) {
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

  const createdFloraTaxa = []
  const createdFloraTaxaNames = []

  for (const record of filteredBatch) {
    const foundFloraTaxon = floraTaxa.find((t) =>
      t.flora_taxa_names.find(
        (tn) => tn.names.wfo_name_reference === record.taxonID,
      ),
    )

    let createdFloraTaxon
    if (!foundFloraTaxon) {
      createdFloraTaxon = {
        id:
          options && options.uuids
            ? options.uuids.flora_taxa.shift()
            : uuidv4(),
        created_by_wfo_ingest_id: ingestId,
      }
      createdFloraTaxa.push(createdFloraTaxon)
    }

    createdFloraTaxaNames.push(
      generateFloraTaxaName(
        foundFloraTaxon || createdFloraTaxon,
        names,
        record,
        ingestId,
        options,
      ),
    )
  }

  await prisma.flora_taxa.createMany({
    data: createdFloraTaxa,
  })

  await prisma.flora_taxa_names.createMany({
    data: createdFloraTaxaNames,
  })
}

function generateFloraTaxaName(floraTaxon, names, record, ingestId, options) {
  const name = names.find((n) => n.wfo_name_reference === record.taxonID)
  return {
    id:
      options && options.uuids
        ? options.uuids.flora_taxa_names.shift()
        : uuidv4(),
    flora_taxon_id: floraTaxon.id,
    name_id: name.id,
    status: normalizedRecordStatus(record),
    ingest_id: ingestId,
  }
}

async function insertSynonymFloraTaxaNames(
  filteredBatch,
  names,
  ingestId,
  excludedRecords,
  options,
) {
  // Get the accepted flora_taxa by acceptedNameUsageID
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

  const createdFloraTaxaNames = []

  for (var record of filteredBatch) {
    // Insert the flora_taxa_names record
    let floraTaxon = acceptedFloraTaxa.find((t) =>
      t.flora_taxa_names.find(
        (tn) => tn.names.wfo_name_reference === record.acceptedNameUsageID,
      ),
    )

    if (!floraTaxon) {
      // If the record's "accepted" name is an irrelevant taxon (e.g. genus/family), delete the name
      if (
        excludedRecords.find(
          (excludedRecord) =>
            record.acceptedNameUsageID === excludedRecord.record.taxonID,
        )
      ) {
        excludedRecords.push({ reason: 'SYNONYM_OF_IRRELEVANT_TAXON', record })
        const nameToDelete = await prisma.names.findFirst({
          where: {
            wfo_name_reference: record.taxonID,
          },
        })
        await prisma.names.delete({
          where: {
            id: nameToDelete.id,
          },
        })
        continue
      }

      // If the record's "accepted" name is actually another synonym, follow down the rabbit hole to find the correct flora taxon
      floraTaxon = await findAcceptedFloraTaxonRecursive(
        record.acceptedNameUsageID,
      )
    }

    if (!floraTaxon) {
      console.error(
        'Could not find record',
        record.acceptedNameUsageID,
        ', recorded as the accepted name of record ',
        record.taxonID,
      )
      throw new Error('ACCEPTED_RECORD_NOT_FOUND')
    }

    createdFloraTaxaNames.push(
      generateFloraTaxaName(floraTaxon, names, record, ingestId, options),
    )
  }
  await prisma.flora_taxa_names.createMany({
    data: createdFloraTaxaNames,
  })
}

async function loadClassification(filePath: string) {
  const readStream = fs.createReadStream(filePath, { encoding: 'utf-8' })

  const csvParser = parse({
    delimiter: '\t',
    relax: true,
    columns: true,
  })

  readStream.pipe(csvParser)

  return batcher(csvParser, BATCH_SIZE)
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
  const totalRecords = await countLines(filePath)

  await prisma.$executeRaw(`SET session_replication_role = 'replica';`)

  try {
    const excludedRecords = []

    // Load the TSV file, parse it, batch the records and make an iterable
    const firstPassBatches = await loadClassification(filePath)

    console.info()
    console.info('Ingesting accepted/unknown names [1/2]')

    let firstPassProgress = 0

    const firstPassBar = new cliProgress.SingleBar(
      {},
      cliProgress.Presets.shades_classic,
    )
    firstPassBar.start(totalRecords, 0)

    for await (const batch of firstPassBatches) {
      // Fetch names joined to "current" flora_taxon_names by wfo-* ID
      let existingNames = await fetchNames(batch)

      for (var excludedRecord of batch.filter(irrelevantTaxonRanksFilter)) {
        excludedRecords.push({
          reason: 'IRRELEVANT_TAXON_RANK',
          record: excludedRecord,
        })
      }

      // For records relating to names that don't exist by wfo-* ID, insert the names
      let createdNames = await insertMissingNames(
        batch.filter(relevantTaxonRanksFilter),
        existingNames,
        ingestId,
        options,
      )

      // Add flora_taxa and flora_taxa_names for accepted/unchecked records only
      await findOrInsertFloraTaxa(
        batch
          .filter(acceptedOrUncheckedStatusFilter)
          .filter(relevantTaxonRanksFilter),
        existingNames.concat(createdNames),
        ingestId,
        options,
      )

      firstPassProgress += batch.length
      firstPassBar.update(firstPassProgress)
    }

    firstPassBar.update(totalRecords)
    firstPassBar.stop()

    // Load/parse/batch the TSV file again so we can handle synonyms
    // We do this in a second pass so we don't have to keep the whole file in memory
    const secondPassBatches = await loadClassification(filePath)

    console.info()
    console.info('Ingesting synonyms [2/2]')

    let secondPassProgress = 0

    const secondPassBar = new cliProgress.SingleBar(
      {},
      cliProgress.Presets.shades_classic,
    )
    secondPassBar.start(totalRecords, 0)

    // For eacn Synonym, find the name record by wfo-* ID, and look up the accepted flora_taxon by acceptedNameUsageID,
    // then insert the flora_taxa_names record
    for await (const batch of secondPassBatches) {
      let names = await fetchNames(batch)

      await insertSynonymFloraTaxaNames(
        batch.filter(synonymStatusFilter).filter(relevantTaxonRanksFilter),
        names,
        ingestId,
        excludedRecords,
        options,
      )

      secondPassProgress += batch.length
      secondPassBar.update(secondPassProgress)
    }
    secondPassBar.update(totalRecords)
    secondPassBar.stop()
  } catch (err) {
    console.error('ERROR:', err)
  } finally {
    await prisma.$executeRaw(`SET session_replication_role = 'origin';`)
    if (options.disconnectDatabase) {
      await prisma.$disconnect()
    }
  }
}
