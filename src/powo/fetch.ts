require('custom-env').env()
import { PrismaClient } from '@prisma/client'
import { logDeep } from '../common/utils'
import request from 'requestretry'
import sleep from 'sleep-promise'

const POWO_API = `http://www.plantsoftheworldonline.org/api/2/search?perPage=500`

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

async function fetchPowo(page: number, cursor?: string) {
  const start: bigint = process.hrtime.bigint()
  let res = await request({
    url: `${POWO_API}${cursor ? `&cursor=${cursor}` : ``}`,
    json: true,
  })
  const end: bigint = process.hrtime.bigint()
  const responseTime = Number((end - start) / BigInt(1000000))
  // Wait for half the time the request took
  console.log(
    `Fetched page ${page} in ${responseTime}ms; sleeping for ${
      responseTime / 2
    }ms`,
  )
  await sleep(responseTime / 2)
  await insertData(res)
  if (
    res.body.cursor &&
    res.body.cursor.length > 0 &&
    res.body.results &&
    res.body.results.length > 0
  ) {
    await fetchPowo(page + 1, res.body.cursor)
  }
}

async function insertData(res: any) {
  let data
  try {
    data = res.body.results.map((r) => {
      try {
        return {
          id: r.fqId,
          accepted: r.accepted,
          author: r.author,
          family: r.family,
          name: r.name,
          rank: r.rank,
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

;(async () => {
  await prisma.$executeRaw(`TRUNCATE TABLE app.powo_raw_data;`)
  await fetchPowo(1)
  process.exit()
})()
