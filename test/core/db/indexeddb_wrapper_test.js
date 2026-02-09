/**
 * تست‌های واحد برای IndexedDB Wrapper
 * @jest-environment jsdom
 */

import { IndexedDBWrapper } from '../../../core/db/indexeddb-wrapper.js';

// Mock برای IndexedDB
const mockDB = {
  transaction: jest.fn(),
  createObjectStore: jest.fn(),
  objectStoreNames: [],
};

const mockRequest = {
  onupgradeneeded: null,
  onsuccess: null,
  onerror: null,
  result: mockDB,
  error: null,
};

const mockOpenRequest = jest.fn(() => mockRequest);
global.indexedDB = {
  open: mockOpenRequest,
};

describe('IndexedDBWrapper', () => {
  let dbWrapper;
  const dbName = 'test-db';
  const storeName = 'test-store';
  const version = 1;

  beforeEach(() => {
    jest.clearAllMocks();
    dbWrapper = new IndexedDBWrapper(dbName, version);
  });

  afterEach(async () => {
    if (dbWrapper.isConnected()) {
      await dbWrapper.close();
    }
  });

  test('should create singleton instance', () => {
    const instance1 = IndexedDBWrapper.getInstance();
    const instance2 = IndexedDBWrapper.getInstance();
    expect(instance1).toBe(instance2);
  });

  test('should open database successfully', async () => {
    const onSuccess = jest.fn();
    const onError = jest.fn();

    mockRequest.onsuccess = () => onSuccess();
    
    await dbWrapper.open(storeName, { keyPath: 'id' });
    
    expect(mockOpenRequest).toHaveBeenCalledWith(dbName, version);
    expect(onSuccess).toHaveBeenCalled();
  });

  test('should handle database open error', async () => {
    mockRequest.onerror = () => {
      mockRequest.error = new Error('Open failed');
    };

    await expect(dbWrapper.open(storeName, { keyPath: 'id' }))
      .rejects
      .toThrow('Failed to open database');
  });

  test('should add item to store', async () => {
    const mockTx = {
      objectStore: jest.fn(() => ({
        add: jest.fn().mockResolvedValue('key1'),
      })),
      oncomplete: null,
      onerror: null,
    };
    mockDB.transaction.mockReturnValue(mockTx);

    await dbWrapper.open(storeName, { keyPath: 'id' });
    const result = await dbWrapper.add(storeName, { id: '1', name: 'test' });

    expect(result).toBe('key1');
    expect(mockDB.transaction).toHaveBeenCalledWith(storeName, 'readwrite');
  });

  test('should get item from store', async () => {
    const mockTx = {
      objectStore: jest.fn(() => ({
        get: jest.fn().mockResolvedValue({ id: '1', name: 'test' }),
      })),
    };
    mockDB.transaction.mockReturnValue(mockTx);

    await dbWrapper.open(storeName, { keyPath: 'id' });
    const result = await dbWrapper.get(storeName, '1');

    expect(result).toEqual({ id: '1', name: 'test' });
  });

  test('should update item in store', async () => {
    const mockTx = {
      objectStore: jest.fn(() => ({
        put: jest.fn().mockResolvedValue('key1'),
      })),
      oncomplete: null,
    };
    mockDB.transaction.mockReturnValue(mockTx);

    await dbWrapper.open(storeName, { keyPath: 'id' });
    const result = await dbWrapper.update(storeName, { id: '1', name: 'updated' });

    expect(result).toBe('key1');
  });

  test('should delete item from store', async () => {
    const mockTx = {
      objectStore: jest.fn(() => ({
        delete: jest.fn().mockResolvedValue(undefined),
      })),
      oncomplete: null,
    };
    mockDB.transaction.mockReturnValue(mockTx);

    await dbWrapper.open(storeName, { keyPath: 'id' });
    await dbWrapper.delete(storeName, '1');

    expect(mockDB.transaction).toHaveBeenCalledWith(storeName, 'readwrite');
  });

  test('should close database connection', async () => {
    mockDB.close = jest.fn();
    await dbWrapper.open(storeName, { keyPath: 'id' });
    await dbWrapper.close();

    expect(mockDB.close).toHaveBeenCalled();
    expect(dbWrapper.isConnected()).toBe(false);
  });

  test('should throw error when operating without connection', async () => {
    await expect(dbWrapper.get(storeName, '1'))
      .rejects
      .toThrow('Database not connected');
  });
});
