import { PrismaClient } from '@prisma/client'
import { prismaOptions } from '../common/utils'
import { fetchRawData } from './ingest'
import yargs from 'yargs/yargs'
import { hideBin } from 'yargs/helpers'
const argv = yargs(hideBin(process.argv)).options({
  ingest: { type: 'string' },
  cursor: { type: 'string' },
}).argv

const prisma = new PrismaClient(prismaOptions)

;(async () => {
  let ingest
  let truncateData = true
  if (argv.ingest && argv.cursor) {
    ingest = await prisma.flora_ingests.findUnique({
      where: {
        id: argv.ingest,
      },
    })
    truncateData = false
    console.log(`Resuming ingest ${ingest.id} from cursor ${argv.cursor}`)
  } else {
    if (argv.ingest || argv.cursor) {
      console.error('Please specify both `ingest` and `cursor`, or neither')
      process.exit(1)
    }
    ingest = await prisma.flora_ingests.create({
      data: {
        type: 'powo',
        created_at: new Date(),
      },
    })
    console.log(`Created ingest ${ingest.id}`)
  }

  await fetchRawData(ingest.id, argv.cursor, { truncateData })
  process.exit()
})()
