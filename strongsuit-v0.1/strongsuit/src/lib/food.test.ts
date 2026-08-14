import { describe, it, expect, vi, beforeEach } from 'vitest'
import { lookupBarcode } from './food'

// Mock global fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('lookupBarcode', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('handles 404 gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 404,
      ok: false
    })

    const result = await lookupBarcode('12345')
    expect('type' in result && result.type).toBe('not_found')
  })

  it('handles network error gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Failed to fetch'))

    const result = await lookupBarcode('12345')
    expect('type' in result && result.type).toBe('network_error')
    if ('type' in result) expect(result.message).toBe('Failed to fetch')
  })

  it('parses successful 100g response', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({
        status: 1,
        product: {
          product_name: 'Test Bar',
          brands: 'Test Brand, Other',
          serving_size: '50g',
          nutriments: {
            'energy-kcal_100g': 400,
            proteins_100g: 20,
            carbohydrates_100g: 40,
            fat_100g: 10
          }
        }
      })
    })

    const result = await lookupBarcode('00000')
    expect(result).toHaveProperty('barcode', '00000')
    expect(result).toHaveProperty('name', 'Test Bar')
    expect(result).toHaveProperty('brand', 'Test Brand')
    // Values mapped from 100g fields
    expect(result).toHaveProperty('calories', 400)
    expect(result).toHaveProperty('protein', 20)
    expect(result).toHaveProperty('carbs', 40)
    expect(result).toHaveProperty('fat', 10)
    expect(result).toHaveProperty('servingSize', '50g')
  })

  it('prefers per-serving macros if available', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({
        status: 1,
        product: {
          product_name: 'Test Bar',
          nutriments: {
            'energy-kcal_100g': 400,
            'energy-kcal_serving': 200,
            proteins_100g: 20,
            proteins_serving: 10,
            carbohydrates_100g: 40,
            carbohydrates_serving: 20,
            fat_100g: 10,
            fat_serving: 5
          }
        }
      })
    })

    const result = await lookupBarcode('00000')
    expect(result).toHaveProperty('calories', 200)
    expect(result).toHaveProperty('protein', 10)
    expect(result).toHaveProperty('carbs', 20)
    expect(result).toHaveProperty('fat', 5)
  })
})
