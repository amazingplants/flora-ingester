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
const previousIngestId = `a5b2df48-4414-49aa-b415-1cc8510ba017`

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

  describe('with existing data', () => {
    let uuids

    beforeEach(async () => {
      await resetDatabase()
      uuids = uuidGenerator()

      nock(POWO_HOSTNAME)
        .get('/api/2/search?perPage=500')
        .reply(200, fixtures.api.n3, { 'content-type': 'application/json' })

      nock(POWO_HOSTNAME)
        .get(`/api/2/search?perPage=500&cursor=${fixtures.api.n3.cursor}`)
        .reply(200, fixtures.api.empty, {
          'content-type': 'application/json',
        })

      await createIngest(previousIngestId, 'powo', true)

      await fetchAndIngest(previousIngestId, null, {
        uuids,
      })
    })

    describe('and some new records', () => {
      beforeEach(async () => {
        nock(POWO_HOSTNAME)
          .get('/api/2/search?perPage=500')
          .reply(200, fixtures.api.n7, {
            'content-type': 'application/json',
          })

        nock(POWO_HOSTNAME)
          .get(`/api/2/search?perPage=500&cursor=${fixtures.api.n7.cursor}`)
          .reply(200, fixtures.api.empty, {
            'content-type': 'application/json',
          })

        await createIngest(currentIngestId, 'powo')
        await fetchAndIngest(currentIngestId, null, {
          uuids,
        })
        dbSnapshot = await createDbSnapshot()
      })

      test('creates additional flora_taxa', () => {
        expect(dbSnapshot.flora_taxa.length).toBe(3)
        expect(dbSnapshot.flora_taxa.sort(byId)).toMatchObject(
          fixtures.n7.flora_taxa.sort(byId),
        )
      })

      test('creates additional flora_names', () => {
        expect(dbSnapshot.flora_names.length).toBe(7)
        expect(dbSnapshot.flora_names.sort(byId)).toMatchObject(
          fixtures.n7.flora_names.sort(byId),
        )
      })

      test('creates additional flora_taxa_names', () => {
        expect(dbSnapshot.flora_taxa_names.length).toBe(10)
        expect(dbSnapshot.flora_taxa_names.sort(byId)).toMatchObject(
          fixtures.n7.flora_taxa_names.sort(byId),
        )
      })

      test('does not duplicate existing flora_names', () => {
        expect(
          dbSnapshot.flora_names.filter(
            (n) => n.scientific_name === 'Aphelandra straminea',
          ).length,
        ).toBe(1)
      })

      afterAll(closeDatabaseConnection)
    })
  })
})
