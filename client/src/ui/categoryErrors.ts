import { ApiError } from '../api/http'

// Turns a failed create or rename into a sentence to show next to the name field.
export function categoryErrorMessage(error: unknown, name: string): string {
  if (error instanceof ApiError) {
    if (error.code === 'CATEGORY_NAME_TAKEN') return `You already have a category called “${name.trim()}”`
    if (error.details?.length) return error.details[0].message // e.g. "Name is required"
  }
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}
