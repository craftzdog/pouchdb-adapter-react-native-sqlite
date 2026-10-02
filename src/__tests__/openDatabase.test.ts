import { open } from '@op-engineering/op-sqlite'
import openDB, { closeDB } from '../openDatabase'

jest.mock('@op-engineering/op-sqlite', () => ({ open: jest.fn() }))

const mockOpen = open as jest.Mock

const makeConnection = () => ({ executeSync: jest.fn(), close: jest.fn() })

describe('openDB', () => {
  afterEach(() => {
    closeDB('test.sqlite')
    mockOpen.mockReset()
  })

  it('hands the connection to onOpen once it is configured', () => {
    const connection = makeConnection()
    mockOpen.mockReturnValue(connection)
    const onOpen = jest.fn(() => {
      expect(connection.executeSync).toHaveBeenCalledWith(
        'PRAGMA journal_mode = WAL'
      )
    })

    const result = openDB({ name: 'test.sqlite', onOpen })

    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onOpen).toHaveBeenCalledWith(connection)
    expect(mockOpen).toHaveBeenCalledWith({ name: 'test.sqlite' })
    expect('db' in result && result.db).toBe(connection)
  })

  it('calls onOpen once for a database that is already open', () => {
    mockOpen.mockReturnValue(makeConnection())
    const onOpen = jest.fn()

    openDB({ name: 'test.sqlite', onOpen })
    openDB({ name: 'test.sqlite', onOpen })

    expect(mockOpen).toHaveBeenCalledTimes(1)
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('reports an error thrown by onOpen as a failed opening', () => {
    mockOpen.mockReturnValue(makeConnection())
    const failure = new Error('unknown pragma')

    const result = openDB({
      name: 'test.sqlite',
      onOpen: () => {
        throw failure
      },
    })

    expect(result).toEqual({ error: failure })
  })
})
