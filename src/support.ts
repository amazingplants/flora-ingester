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

export const VALID_TAXONOMIC_STATUSES = ['Accepted', 'Synonym', 'Unchecked']

export function acceptedOrUncheckedStatusFilter(record) {
  return ['Accepted', 'Unchecked'].indexOf(record.taxonomicStatus) > -1
}

export function synonymStatusFilter(record) {
  return record.taxonomicStatus === 'Synonym'
}

export function normalizeStatus(status) {
  if (status === 'Accepted') {
    return 'accepted'
  }
  if (status === 'Synonym') {
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
