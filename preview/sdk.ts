export async function consoleFetch(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const body = await response.json();
    const error: any = new Error(body.message || response.statusText);
    error.status = response.status; throw error;
  }
  return response;
}
