import dotenv from 'dotenv'
import { ingest } from './ingester'
import { logStats } from './support'
import { v4 as uuidv4 } from 'uuid'

dotenv.config()

const ingestId = uuidv4()

;(async () => {
  await ingest({ ingestId })
  await logStats({ ingestId })
  process.exit()
})()
