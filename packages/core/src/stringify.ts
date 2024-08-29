export function __stringify__json(): string {
  return ''
}

export function __stringify__formData(): FormData {
  return {} as FormData
}

export function __stringify__urlSearchParams(data: URLSearchParams): URLSearchParams {
  return data.toString()
}
