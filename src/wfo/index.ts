require('custom-env').env()

import fs from 'fs'
import * as wfo from './ingest'
import { logStats } from './support'
import { v4 as uuidv4 } from 'uuid'

const ingestId = uuidv4()

;(async () => {
  const results = await wfo.ingest(ingestId, './local-data/classification.txt')
  await logStats(ingestId, results)
  process.exit()
})()
