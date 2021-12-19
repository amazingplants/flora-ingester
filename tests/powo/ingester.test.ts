import {
  closeDatabaseConnection,
  createDbSnapshot,
  createIngest,
  resetDatabase,
  byId,
} from '../support'
import nock from 'nock'
import {
  fetchRawData,
  fetchAndIngest,
  POWO_HOSTNAME,
} from '../../dist/powo/ingest'

const currentIngestId = `923ac4d6-93c7-4f7c-8835-efdf31af7067`
const previousIngestId = `40c7d1aa-d4a7-48ac-b452-1f06dcd0e437`
const oldIngestId = `f2262700-8336-4e9c-a10b-a661803d266a`

import fixtures from '../fixtures/powo'
import uuidGenerator from '../fixtures/uuids'

let dbSnapshot: {
  flora_taxa: any[]
  flora_taxa_names: any[]
  flora_names: any[]
}

describe('powo', () => {
  describe('with no existing data', () => {
    describe('and some new records', () => {
      beforeEach(async () => {
        nock(POWO_HOSTNAME)
          .get('/api/2/search?perPage=500')
          .reply(200, fixtures.api.n3, { 'content-type': 'application/json' })
        nock(POWO_HOSTNAME)
          .get(`/api/2/search?perPage=500&cursor=${fixtures.api.n3.cursor}`)
          .reply(200, fixtures.api.empty, {
            'content-type': 'application/json',
          })

        await resetDatabase()
        await createIngest(currentIngestId, 'powo')
        await fetchAndIngest(currentIngestId, null, {
          uuids: uuidGenerator(),
        })
        dbSnapshot = await createDbSnapshot()
      })

      test('creates flora_taxa', () => {
        expect(dbSnapshot.flora_taxa.length).toBe(1)
        expect(dbSnapshot.flora_taxa).toMatchObject(fixtures.n3.flora_taxa)
      })

      test('creates flora_names', () => {
        expect(dbSnapshot.flora_names.length).toBe(3)
        expect(dbSnapshot.flora_names.sort(byId)).toMatchObject(
          fixtures.n3.flora_names.sort(byId),
        )
      })

      test('creates flora_taxa_names', () => {
        expect(dbSnapshot.flora_taxa_names.length).toBe(3)
        expect(dbSnapshot.flora_taxa_names.sort(byId)).toMatchObject(
          fixtures.n3.flora_taxa_names.sort(byId),
        )
      })

      afterAll(closeDatabaseConnection)
    })
  })
})
