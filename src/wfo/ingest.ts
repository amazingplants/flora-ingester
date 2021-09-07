const FETCH_BATCH_SIZE = 10000
const BATCH_SIZE = 1000

import {
  VALID_TAXONOMIC_STATUSES,
  IRRELEVANT_TAXON_RANKS,
  acceptedOrUncheckedStatusFilter,
  batcher,
  countLines,
  irrelevantTaxonRanksFilter,
  normalizedRecordStatus,
  normalizedStatus,
  relevantTaxonRanksFilter,
  synonymStatusFilter,
} from './support'

import { logDeep } from '../common/utils'

import { PrismaClient } from '@prisma/client'
import cliProgress from 'cli-progress'
import fs from 'fs'
import parse from 'csv-parse'
import { v4 as uuidv4 } from 'uuid'
import { prismaOptions } from '../common/utils'

const prisma = new PrismaClient(prismaOptions)

/*if (process.env.DEBUG) {
  prisma.$on('query', (e) => {
    console.log('Query: ')
    logDeep(e.query)
    console.log('Params: ' + e.params)
    console.log('Duration: ' + e.duration + 'ms')
  })
}*/

const SQL_IRRELEVANT_TAXON_RANKS = IRRELEVANT_TAXON_RANKS.map(
  (r) => `'${r}'`,
).join(',')

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

async function fetchNames(records: any[], activeWfoIngestId: string) {
  return await prisma.flora_names.findMany({
    where: {
      wfo_name_reference: {
        in: records.map((record) => record.taxonID),
      },
    },
    include: {
      flora_taxa_names: {
        where: {
          ingest_id: activeWfoIngestId,
        },
      },
    },
  })
}

async function findAcceptedFloraTaxonRecursive(
  acceptedNameReference,
  originalRecord,
  excludedRecords,
  depth = 0,
): Promise<any> {
  if (depth >= 3) {
    return null
  }

  // If the record's "accepted" name is an irrelevant taxon (e.g. genus/family), delete the name
  if (
    excludedRecords.find(
      (excludedRecord) =>
        acceptedNameReference === excludedRecord.record.taxonID,
    )
  ) {
    excludedRecords.push({
      reason: 'SYNONYM_OF_IRRELEVANT_TAXON',
      record: originalRecord,
    })
    const nameToDelete = await prisma.flora_names.findFirst({
      where: {
        wfo_name_reference: originalRecord.taxonID,
      },
    })
    await prisma.flora_names.delete({
      where: {
        id: nameToDelete.id,
      },
    })
    return // <- undefined
  }

  let name = await prisma.flora_names.findFirst({
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
      originalRecord,
      excludedRecords,
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
        id:
          options && options.uuids
            ? options.uuids.flora_names.shift()
            : uuidv4(),
      })
      insertedNames.push(insertedName)
    }
  }
  await prisma.flora_names.createMany({ data: insertedNames })
  return insertedNames
}

// For each Accepted/Unchecked record, find the related flora_taxon via flora_taxa_names for the last ingest
// - If the flora_taxon doesn't exist, create it
async function findOrInsertFloraTaxa(
  filteredBatch,
  floraNames,
  ingestId: string,
  activeWfoIngestId: string,
  options: any,
) {
  const floraTaxa = await prisma.flora_taxa.findMany({
    where: {
      flora_taxa_names: {
        some: {
          status: {
            in: ['accepted', 'unknown'],
          },
          ingest_id: activeWfoIngestId,
          flora_names: {
            wfo_name_reference: {
              in: filteredBatch.map((r) => r.taxonID),
            },
          },
        },
      },
    },
    include: { flora_taxa_names: { include: { flora_names: true } } },
  })

  const createdFloraTaxa = []
  const createdFloraTaxaNames = []

  for (const record of filteredBatch) {
    const foundFloraTaxon = floraTaxa.find((t) =>
      t.flora_taxa_names.find(
        (tn) => tn.flora_names.wfo_name_reference === record.taxonID,
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
        floraNames,
        record,
        ingestId,
        options,
      ),
    )
  }

  await prisma.flora_taxa.createMany({
    data: createdFloraTaxa,
  })

  return prisma.flora_taxa_names.createMany({
    data: createdFloraTaxaNames,
  })
}

function generateFloraTaxaName(
  floraTaxon,
  floraNames,
  record,
  ingestId,
  options,
) {
  const name = floraNames.find((n) => n.wfo_name_reference === record.taxonID)
  return {
    id:
      options && options.uuids
        ? options.uuids.flora_taxa_names.shift()
        : uuidv4(),
    flora_taxon_id: floraTaxon.id,
    flora_name_id: name.id,
    status: normalizedRecordStatus(record),
    ingest_id: ingestId,
  }
}

async function insertSynonymFloraTaxaNames(
  filteredBatch,
  floraNames,
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
          flora_names: {
            wfo_name_reference: {
              in: filteredBatch.map((r) => r.acceptedNameUsageID),
            },
          },
        },
      },
    },
    include: { flora_taxa_names: { include: { flora_names: true } } },
  })

  const createdFloraTaxaNames = []

  for (var record of filteredBatch) {
    // Insert the flora_taxa_names record
    let floraTaxon = acceptedFloraTaxa.find((t) =>
      t.flora_taxa_names.find(
        (tn) =>
          tn.flora_names.wfo_name_reference === record.acceptedNameUsageID,
      ),
    )

    if (!floraTaxon) {
      // If the record's "accepted" name is actually another synonym, follow down the rabbit hole to find the correct flora taxon
      floraTaxon = await findAcceptedFloraTaxonRecursive(
        record.acceptedNameUsageID,
        record,
        excludedRecords,
      )
      // If the recursive finder returned no value, it means it has found a recoverable issue with the upstream accepted name
      // (maybe it's a genus?), so move onto the next record without throwing
      if (typeof floraTaxon === 'undefined') {
        continue
      }
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
      generateFloraTaxaName(floraTaxon, floraNames, record, ingestId, options),
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

  return batcher(csvParser, FETCH_BATCH_SIZE)
}

export async function fetchAndIngest(
  ingestId: string,
  filePath: string,
  options?: {
    uuids?: {
      flora_names: string[]
      flora_taxa: string[]
      flora_taxa_names: string[]
    }
    disconnectDatabase?: boolean
  },
) {
  await fetchRawData(ingestId, filePath, options)
  await ingest(ingestId, options)
}

export async function fetchRawData(
  ingestId: string,
  filePath: string,
  options?: {
    uuids?: {
      flora_names: string[]
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

  await prisma.$executeRaw(`TRUNCATE TABLE app.wfo_raw_data;`)

  if (process.env.NODE_ENV !== 'test')
    console.info('Starting WFO data import with ID ', ingestId)
  const totalRecords = await countLines(filePath)
  const batches = await loadClassification(filePath)

  let progress = 0

  const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic)
  bar.start(totalRecords, 0)

  for await (const batch of batches) {
    await prisma.wfo_raw_data.createMany({
      data: batch.map((record) => {
        record.ingest_id = ingestId
        return record
      }),
    })
    progress += batch.length
    bar.update(progress)
  }

  bar.update(totalRecords)
  bar.stop()

  if (options.disconnectDatabase) {
    await prisma.$disconnect()
  }
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
  options?: {
    uuids?: {
      flora_names: string[]
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

  if (process.env.NODE_ENV !== 'test')
    console.info('Starting WFO ingest with ID ', ingestId)

  // await prisma.$executeRaw(`SET session_replication_role = 'replica';`)

  const activeWfoIngest = await prisma.flora_ingests.findFirst({
    where: {
      active: true,
    },
  })
  const activeWfoIngestId = activeWfoIngest ? activeWfoIngest.id : undefined

  try {
    const excludedRecords = []

    const [{ count: firstPassTotalRecords }] = await prisma.$queryRaw(
      `SELECT COUNT(wfo_raw_data."taxonID") FROM wfo_raw_data LEFT JOIN flora_names ON wfo_raw_data."taxonID" = flora_names.wfo_name_reference AND flora_names.wfo_name_reference IS NULL WHERE wfo_raw_data.first_pass_processed = false`,
    )

    // Load the TSV file, parse it, batch the records and make an iterable
    // const firstPassBatches = await loadClassification(filePath)

    if (process.env.NODE_ENV !== 'test') console.info()
    if (process.env.NODE_ENV !== 'test')
      console.info('Ingesting accepted/unknown names [1/2]')

    let firstPassProgress = 0

    const firstPassBar = new cliProgress.SingleBar(
      {},
      cliProgress.Presets.shades_classic,
    )
    firstPassBar.start(firstPassTotalRecords, 0)

    let batch: [Object]

    do {
      batch = await prisma.$queryRaw(
        `SELECT wfo_raw_data.* FROM wfo_raw_data LEFT JOIN flora_names ON wfo_raw_data."taxonID" = flora_names.wfo_name_reference AND flora_names.wfo_name_reference IS NULL WHERE wfo_raw_data.first_pass_processed = false LIMIT 10000`,
      )

      await prisma.$transaction(async () => {
        // Fetch names joined to "current" flora_taxon_names by wfo-* ID
        let existingNames = await fetchNames(batch, activeWfoIngestId)

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
          activeWfoIngestId,
          options,
        )

        return prisma.wfo_raw_data.updateMany({
          data: {
            first_pass_processed: true,
          },
          where: {
            taxonID: {
              in: batch.map((record: { taxonID: null }) => record.taxonID),
            },
          },
        })
      })

      firstPassProgress += batch.length
      firstPassBar.update(firstPassProgress)
    } while (batch.length > 0)

    firstPassBar.update(firstPassTotalRecords)
    firstPassBar.stop()

    // Load/parse/batch the TSV file again so we can handle synonyms
    // We do this in a second pass so we don't have to keep the whole file in memory
    // const secondPassBatches = await loadClassification(filePath)

    if (process.env.NODE_ENV !== 'test') console.info()
    if (process.env.NODE_ENV !== 'test')
      console.info('Ingesting synonyms [2/2]')

    const [{ count: secondPassTotalRecords }] = await prisma.$queryRaw(
      `SELECT COUNT(wfo_raw_data."taxonID") FROM wfo_raw_data WHERE wfo_raw_data."taxonomicStatus" = 'Synonym' AND second_pass_processed = false`,
    )

    let secondPassProgress = 0

    const secondPassBar = new cliProgress.SingleBar(
      {},
      cliProgress.Presets.shades_classic,
    )
    secondPassBar.start(secondPassTotalRecords, 0)

    console.time('synonyms')

    // For eacn Synonym, find the name record by wfo-* ID, and look up the accepted flora_taxon by acceptedNameUsageID,
    // then insert the flora_taxa_names record
    do {
      batch = await prisma.$queryRaw(
        `SELECT wfo_raw_data.* FROM wfo_raw_data WHERE wfo_raw_data."taxonomicStatus" = 'Synonym' AND wfo_raw_data.second_pass_processed = false LIMIT 1000`,
      )

      let floraNames = await fetchNames(batch, activeWfoIngestId)

      await prisma.$transaction(async () => {
        await insertSynonymFloraTaxaNames(
          batch.filter(synonymStatusFilter).filter(relevantTaxonRanksFilter),
          floraNames,
          ingestId,
          excludedRecords,
          options,
        )

        return prisma.wfo_raw_data.updateMany({
          data: {
            second_pass_processed: true,
          },
          where: {
            taxonID: {
              in: batch.map((record: { taxonID: null }) => record.taxonID),
            },
          },
        })
      })

      secondPassProgress += batch.length
      secondPassBar.update(secondPassProgress)
    } while (batch.length > 0)

    secondPassBar.update(secondPassTotalRecords)
    secondPassBar.stop()

    return {
      success: true,
      excludedRecords,
    }
  } catch (err) {
    console.error('ERROR:', err)
  } finally {
    // await prisma.$executeRaw(`SET session_replication_role = 'origin';`)
    if (options.disconnectDatabase) {
      await prisma.$disconnect()
    }
  }
}
