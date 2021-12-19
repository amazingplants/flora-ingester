import { PrismaClient, powo_raw_data } from '@prisma/client'
import cliProgress from 'cli-progress'
import request from 'requestretry'
import sleep from 'sleep-promise'
import { prismaOptions } from '../common/utils'
import gnparser from 'gnparser'
import { v4 as uuidv4 } from 'uuid'

import {
  irrelevantTaxonRanksFilter,
  normalizedRecordStatus,
  relevantTaxonRanksFilter,
} from '../common/support'

export const POWO_HOSTNAME = 'http://www.plantsoftheworldonline.org'

const POWO_API = `${POWO_HOSTNAME}/api/2/search?perPage=500`

const prisma = new PrismaClient(prismaOptions)

let nextCursor: string

export async function fetchAndIngest(
  ingestId: string,
  cursor?: string,
  options?: {
    uuids?: {
      flora_names: string[]
      flora_taxa: string[]
      flora_taxa_names: string[]
    }
    disconnectDatabase?: boolean
  },
) {
  await fetchRawData(ingestId, cursor)
  await ingest(ingestId, options)
}

export async function fetchRawData(
  ingestId: string,
  cursor?: string,
  options?: {
    truncateData?: boolean
    disconnectDatabase?: boolean
  },
) {
  options = options || {}
  if (typeof options.disconnectDatabase === 'undefined') {
    options.disconnectDatabase = true
  }

  if (options.truncateData !== false) {
    await prisma.$executeRaw(`TRUNCATE TABLE app.powo_raw_data;`)
  }

  process.on('SIGINT', function () {
    console.log(`To resume:`)
    console.log(
      `npm run powo-fetch${
        process.env.NODE_ENV === 'development' ? '-dev' : ''
      } -- --ingest ${ingestId} --cursor ${nextCursor}`,
    )
    process.exit()
  })

  await fetchPowo(ingestId, 1, cursor)

  if (options.disconnectDatabase) {
    await prisma.$disconnect()
  }
}

async function fetchPowo(ingestId: string, page: number, cursor?: string) {
  const start: bigint = process.hrtime.bigint()
  let res = await request({
    url: `${POWO_API}${cursor ? `&cursor=${cursor}` : ``}`,
    json: true,
  })
  const end: bigint = process.hrtime.bigint()
  const responseTime = Number((end - start) / BigInt(1000000))
  await insertData(ingestId, res)
  if (process.env.NODE_ENV !== 'test')
    console.log(
      `Fetched page ${page} in ${responseTime}ms; sleeping for ${
        responseTime / 2
      }ms`,
    )
  nextCursor = res.body.cursor
  // Wait for half the time the request took
  await sleep(responseTime / 2)
  if (
    res.body.cursor &&
    res.body.cursor.length > 0 &&
    res.body.results &&
    res.body.results.length > 0
  ) {
    await fetchPowo(ingestId, page + 1, res.body.cursor)
  }
}

async function fetchNames(records: any[], activePowoIngestId: string) {
  return await prisma.flora_names.findMany({
    where: {
      powo_name_reference: {
        in: records.map((record) => record.id),
      },
    },
    include: {
      flora_taxa_names: {
        where: {
          ingest_id: activePowoIngestId,
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
    // If a name doesn't exist already, linked to this POWO ID, create it
    if (!names.find((n) => n.powo_name_reference === record.id)) {
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

function nameDataFromRecord(record: any, ingestId: string, options?: any) {
  // TODO all rank epithets
  return {
    id: options && options.id ? options.id : undefined,
    scientific_name: record.name_normalized,
    family: record.family,
    genus: record.genus,
    specific_epithet: record.specific_epithet,
    infraspecific_epithet: record.infraspecific_epithet,
    name_authorship: record.author,
    name_published_in: record.namePublishedIn,
    taxon_rank: record.rank.toLowerCase(),
    powo_name_reference: record.id,
    created_by_ingest_id: ingestId,
    powo_data: {
      accepted_name_reference: record.accepted_id,
      normalized_status: normalizedPowoRecordStatus(record),
    },
  }
}

async function insertData(ingestId: string, res: any) {
  let data
  if (!res.body.results || res.body.results.length === 0) {
    return
  }
  try {
    const parsed = gnparser.parse(
      res.body.results.map((r) => r.name),
      { details: true, cultivars: true, diaereses: true },
    )
    data = res.body.results.map((r, i) => {
      try {
        return {
          id: r.fqId,
          accepted: r.accepted,
          author: r.author,
          family: r.family,
          genus: extractGenusFromDetails(
            parsed[i].details,
            r.rank.toLowerCase(),
          ),
          specific_epithet: extractSpecificEpithetFromDetails(
            parsed[i].details,
          ),
          infraspecific_epithet: extractInfraspecificEpithetFromDetails(
            parsed[i].details,
          ),
          name_verbatim: r.name,
          name_normalized: parsed[i].normalized,
          rank: r.rank.toLowerCase(),
          images: r.images,
          // There's a POWO API bug where the accepted fqId is wrong
          accepted_id:
            r.accepted || !r.synonymOf
              ? null
              : r.synonymOf.url.replace('/taxon/', ''),
        }
      } catch (e) {
        console.log(r)
        console.log(e)
        throw e
      }
    })
  } catch (e) {
    console.log(res)
    console.log(res.body)
    console.log(res.statusCode)
    console.log(e)
  }

  await prisma.powo_raw_data.createMany({
    data,
  })
}

function extractGenusFromDetails(details, rank) {
  if (!details) {
    return null
  }
  if (details.species) {
    return details.species.genus
  }
  if (details.infraspecies) {
    return details.infraspecies.genus
  }
  if (rank === 'genus' && details.uninomial) {
    return details.uninomial.uninomial
  }
  return null
}

function extractSpecificEpithetFromDetails(details) {
  if (!details) {
    return null
  }
  if (details.species) {
    return details.species.species
  }
  if (details.infraspecies) {
    return details.infraspecies.species
  }
  return null
}

function extractInfraspecificEpithetFromDetails(details) {
  if (!details) {
    return null
  }
  if (details.infraspecies) {
    let lastEpithet =
      details.infraspecies[details.infraspecies.infraspecies.length - 1]
    if (lastEpithet) {
      return lastEpithet.value
    }
  }
  return null
}

// For each Accepted/Unchecked record, find the related flora_taxon via flora_taxa_names for the last ingest
// - If the flora_taxon doesn't exist, create it
async function findOrInsertFloraTaxa(
  filteredBatch,
  floraNames,
  ingestId: string,
  activePowoIngestId: string,
  options: any,
) {
  const floraTaxa = await prisma.flora_taxa.findMany({
    where: {
      flora_taxa_names: {
        some: {
          status: {
            in: ['accepted', 'unknown'],
          },
          ingest_id: activePowoIngestId,
          flora_names: {
            powo_name_reference: {
              in: filteredBatch.map((r) => r.id),
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
        (tn) => tn.flora_names.powo_name_reference === record.id,
      ),
    )

    let createdFloraTaxon
    if (!foundFloraTaxon) {
      createdFloraTaxon = {
        id:
          options && options.uuids
            ? options.uuids.flora_taxa.shift()
            : uuidv4(),
        created_by_ingest_id: ingestId,
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
  const name = floraNames.find((n) => n.powo_name_reference === record.id)
  return {
    id:
      options && options.uuids
        ? options.uuids.flora_taxa_names.shift()
        : uuidv4(),
    flora_taxon_id: floraTaxon.id,
    flora_name_id: name.id,
    status: normalizedPowoRecordStatus(record),
    ingest_id: ingestId,
  }
}

function normalizedPowoRecordStatus(record) {
  if (record.accepted === true) {
    return 'accepted'
  }
  return record.accepted_id ? 'synonym' : 'unknown'
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
            powo_name_reference: {
              in: filteredBatch.map((r) => r.accepted_id),
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
        (tn) => tn.flora_names.powo_name_reference === record.accepted_id,
      ),
    )

    if (!floraTaxon) {
      // If the record's "accepted" name is actually another synonym, follow down the rabbit hole to find the correct flora taxon
      floraTaxon = await findAcceptedFloraTaxonRecursive(
        record.accepted_id,
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
        record.accepted_id,
        ', recorded as the accepted name of record ',
        record.id,
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
      (excludedRecord) => acceptedNameReference === excludedRecord.record.id,
    )
  ) {
    excludedRecords.push({
      reason: 'SYNONYM_OF_IRRELEVANT_TAXON',
      record: originalRecord,
    })
    const nameToDelete = await prisma.flora_names.findFirst({
      where: {
        powo_name_reference: originalRecord.id,
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
      powo_name_reference: acceptedNameReference,
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
  let status = name.powo_data['normalized_status']
  if (status === 'synonym') {
    depth++
    return await findAcceptedFloraTaxonRecursive(
      name.powo_data['accepted_name_reference'],
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
    console.info('Starting POWO ingest with ID ', ingestId)

  const activePowoIngest = await prisma.flora_ingests.findFirst({
    where: {
      type: 'powo',
      active: true,
    },
  })
  const activePowoIngestId = activePowoIngest ? activePowoIngest.id : undefined

  try {
    const excludedRecords = []

    const [{ count: firstPassTotalRecords }] = await prisma.$queryRaw(
      `SELECT COUNT(powo_raw_data."id") FROM powo_raw_data LEFT JOIN flora_names ON powo_raw_data."id" = flora_names.powo_name_reference AND flora_names.powo_name_reference IS NULL WHERE powo_raw_data.first_pass_processed = false`,
    )

    if (process.env.NODE_ENV !== 'test') console.info()
    if (process.env.NODE_ENV !== 'test')
      console.info('Ingesting accepted/unknown names [1/2]')

    let firstPassProgress = 0

    const firstPassBar = new cliProgress.SingleBar(
      {},
      cliProgress.Presets.shades_classic,
    )
    firstPassBar.start(firstPassTotalRecords, 0)

    let batch: powo_raw_data[]

    do {
      batch = await prisma.$queryRaw<powo_raw_data[]>(
        `SELECT powo_raw_data.* FROM powo_raw_data LEFT JOIN flora_names ON powo_raw_data."id" = flora_names.powo_name_reference AND flora_names.powo_name_reference IS NULL WHERE powo_raw_data.first_pass_processed = false AND powo_raw_data.name_normalized IS NOT NULL ORDER BY id ASC LIMIT 10000`,
      )

      await prisma.$transaction(async () => {
        // Fetch names joined to "current" flora_taxon_names by POWO ID
        let existingNames = await fetchNames(batch, activePowoIngestId)

        for (var excludedRecord of batch.filter(irrelevantTaxonRanksFilter)) {
          excludedRecords.push({
            reason: 'IRRELEVANT_TAXON_RANK',
            record: excludedRecord,
          })
        }

        // For records relating to names that don't exist by POWO ID, insert the names
        let createdNames = await insertMissingNames(
          batch.filter(relevantTaxonRanksFilter),
          existingNames,
          ingestId,
          options,
        )

        // Add flora_taxa and flora_taxa_names for accepted/unchecked records only
        await findOrInsertFloraTaxa(
          batch.filter((r) => r.accepted).filter(relevantTaxonRanksFilter),
          existingNames.concat(createdNames),
          ingestId,
          activePowoIngestId,
          options,
        )

        return prisma.powo_raw_data.updateMany({
          data: {
            first_pass_processed: true,
          },
          where: {
            id: {
              in: batch.map((record) => record.id),
            },
          },
        })
      })

      firstPassProgress += batch.length
      firstPassBar.update(firstPassProgress)
    } while (batch.length > 0)

    firstPassBar.update(firstPassTotalRecords)
    firstPassBar.stop()

    // Load/parse/batch again so we can handle synonyms

    if (process.env.NODE_ENV !== 'test') console.info()
    if (process.env.NODE_ENV !== 'test')
      console.info('Ingesting synonyms [2/2]')

    const [{ count: secondPassTotalRecords }] = await prisma.$queryRaw(
      `SELECT COUNT(powo_raw_data."id") FROM powo_raw_data LEFT JOIN flora_names ON powo_raw_data."id" = flora_names.powo_name_reference AND flora_names.powo_name_reference IS NULL WHERE powo_raw_data.second_pass_processed = false`,
    )

    let secondPassProgress = 0

    const secondPassBar = new cliProgress.SingleBar(
      {},
      cliProgress.Presets.shades_classic,
    )
    secondPassBar.start(secondPassTotalRecords, 0)

    console.time('synonyms')

    // For eacn Synonym, find the name record by POWO ID, and look up the accepted flora_taxon by acceptedNameUsageID,
    // then insert the flora_taxa_names record
    do {
      batch = await prisma.$queryRaw<powo_raw_data[]>(
        `SELECT powo_raw_data.* FROM powo_raw_data LEFT JOIN flora_names ON powo_raw_data."id" = flora_names.powo_name_reference AND flora_names.powo_name_reference IS NULL WHERE powo_raw_data.second_pass_processed = false AND powo_raw_data.name_normalized IS NOT NULL ORDER BY id ASC LIMIT 10000`,
      )

      let floraNames = await fetchNames(batch, activePowoIngestId)

      await prisma.$transaction(async () => {
        await insertSynonymFloraTaxaNames(
          batch.filter((r) => !r.accepted).filter(relevantTaxonRanksFilter),
          floraNames,
          ingestId,
          excludedRecords,
          options,
        )

        return prisma.powo_raw_data.updateMany({
          data: {
            second_pass_processed: true,
          },
          where: {
            id: {
              in: batch.map((record) => record.id),
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
