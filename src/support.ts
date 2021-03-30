import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import util from 'util'
const prisma = new PrismaClient({ log: [/*'query',*/ `warn`, `error`] })

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

export function logDeep(obj: any) {
  console.log(util.inspect(obj, { showHidden: false, depth: null }))
}

export async function logStats(ingestId: string) {
  const insertedNamesCount = await prisma.names.count({
    where: {
      created_by_wfo_ingest_id: ingestId,
    },
  })

  console.info()
  console.info('Created', insertedNamesCount, 'names')
}

export const VALID_TAXONOMIC_STATUSES = [
  'accepted',
  'synonym',
  'unchecked',
  'homotypicsynonym',
  'heterotypicsynonym',
  'ambiguous',
]

export function acceptedOrUncheckedStatusFilter(record) {
  return ['accepted', 'unknown'].indexOf(normalizedStatus(record)) > -1
}

export function synonymStatusFilter(record) {
  return normalizedStatus(record) === 'synonym'
}

export function relevantTaxonRanksFilter(record) {
  return record.taxonRank !== 'family'
}

export function normalizedStatus(record) {
  let status = record.taxonomicStatus.toLowerCase()
  // Sometimes WFO records are a synonym of themselves -- therefore, unknown
  if (status === 'synonym' && record.acceptedNameUsageID === record.taxonID) {
    return 'unknown'
  }
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
