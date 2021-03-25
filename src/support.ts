import { PrismaClient } from '@prisma/client'
import util from 'util'
const prisma = new PrismaClient({ log: [/*'query',*/ `warn`, `error`] })

export async function* batcher(iterable, batchSize = 5) {
  let batch = []
  for await (const chunk of iterable) {
    batch.push(chunk)
    if (batch.length === batchSize || iterable.readableEnded) {
      yield batch
      batch = []
    }
  }
}

export function logDeep(obj) {
  console.log(util.inspect(obj, { showHidden: false, depth: null }))
}

export async function logStats({ ingestId }) {
  const insertedNamesCount = await prisma.names.count({
    where: {
      created_by_wfo_ingest_id: ingestId,
    },
  })

  console.info('Created', insertedNamesCount, 'names')
}
