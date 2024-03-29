import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import util from 'util'
import { prismaOptions } from './utils'
const prisma = new PrismaClient(prismaOptions)

export async function* batcher(iterable, batchSize: number = 5) {
  let batch = []
  for await (const chunk of iterable) {
    batch.push(chunk)
    if (batch.length === batchSize) {
      yield batch
      batch = []
    }
  }
  // flush final items
  if (batch.length > 0) {
    yield batch
  }
}

export async function logStats(ingestId: string, results: any) {
  const insertedNamesCount = await prisma.flora_names.count({
    where: {
      created_by_ingest_id: ingestId,
    },
  })

  console.info()
  console.info('Created', insertedNamesCount, 'names')
  const irrelevantTaxonRanks = results.excludedRecords.filter(
    (record) => record.reason === 'IRRELEVANT_TAXON_RANK',
  )
  if (irrelevantTaxonRanks.length > 0) {
    console.info(
      'Excluded',
      irrelevantTaxonRanks.length,
      'records with irrelevant taxon ranks (families, genera)',
    )
  }
  const irrelevantSynonymsOfTaxonRanks = results.excludedRecords.filter(
    (record) => record.reason === 'SYNONYM_OF_IRRELEVANT_TAXON',
  )
  if (irrelevantSynonymsOfTaxonRanks.length > 0) {
    console.info(
      'Excluded',
      irrelevantSynonymsOfTaxonRanks.length,
      'records synonyms of excluded records)',
    )
  }
}

export const VALID_TAXONOMIC_STATUSES = [
  'accepted',
  'synonym',
  'unchecked',
  'homotypicsynonym',
  'heterotypicsynonym',
  'ambiguous',
]

export const IRRELEVANT_TAXON_RANKS = ['genus', 'family']
normalizedRecordStatus
export function acceptedOrUncheckedStatusFilter(record) {
  return ['accepted', 'unknown'].indexOf(normalizedRecordStatus(record)) > -1
}

export function synonymStatusFilter(record) {
  return normalizedRecordStatus(record) === 'synonym'
}

export function relevantTaxonRanksFilter(record) {
  // record.taxonRank for WFO; record.rank for POWO
  const taxonRank =
    typeof record.taxonRank === 'undefined' ? record.rank : record.taxonRank
  if (!taxonRank) {
    return false
  }
  return IRRELEVANT_TAXON_RANKS.indexOf(taxonRank.toLowerCase()) === -1
}

export function irrelevantTaxonRanksFilter(record) {
  return !relevantTaxonRanksFilter(record)
}

export function normalizedRecordStatus(record) {
  let status = record.taxonomicStatus.toLowerCase()
  // Sometimes WFO records are a synonym of themselves -- therefore, unknown
  if (status === 'synonym' && record.acceptedNameUsageID === record.taxonID) {
    return 'unknown'
  }
  return normalizedStatus(status)
}

export function normalizedStatus(status) {
  if (status === 'accepted') {
    return 'accepted'
  }
  if (
    status === 'synonym' ||
    status === 'homotypicsynonym' ||
    status === 'heterotypicsynonym'
  ) {
    return 'synonym'
  }
  return 'unknown'
}

export async function countLines(filePath) {
  return new Promise((resolve, reject) => {
    let lineCount = 0
    fs.createReadStream(filePath)
      .on('data', (buffer) => {
        let idx = -1
        lineCount-- // Because the loop will run once for idx=-1
        do {
          idx = buffer.indexOf('\n', idx + 1)
          lineCount++
        } while (idx !== -1)
      })
      .on('end', () => {
        resolve(lineCount - 1)
      })
      .on('error', reject)
  })
}
