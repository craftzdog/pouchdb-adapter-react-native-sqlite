import { open } from '@op-engineering/op-sqlite'
import SqlPouchCore from '../core'

jest.mock('@op-engineering/op-sqlite', () => ({ open: jest.fn() }))
jest.mock('uuid', () => ({ v4: jest.fn(() => 'uuid') }))

const mockOpen = open as jest.Mock

const makeConnection = () => ({
  executeSync: jest.fn(),
  execute: jest.fn(() => Promise.resolve({ rows: [] })),
  transaction: jest.fn(() => new Promise(() => {})),
  close: jest.fn(),
  getDbPath: jest.fn(() => 'mydb.sqlite'),
})

const createPouch = (name: string) => {
  const api: any = {}
  SqlPouchCore.call(api, { name }, () => {})
  return api
}

const closePouch = (api: any) =>
  new Promise<void>((resolve) => api._close(() => resolve()))

describe('_close', () => {
  afterEach(() => mockOpen.mockReset())

  it('closes the op-sqlite connection', async () => {
    const connection = makeConnection()
    mockOpen.mockReturnValue(connection)

    await closePouch(createPouch('mydb'))

    expect(connection.close).toHaveBeenCalledTimes(1)
  })

  it('opens a new connection when the database is opened again', async () => {
    mockOpen.mockImplementation(makeConnection)

    await closePouch(createPouch('reopened'))
    await closePouch(createPouch('reopened'))

    expect(mockOpen).toHaveBeenCalledTimes(2)
  })
})
