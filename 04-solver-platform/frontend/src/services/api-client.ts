import axios, { type AxiosRequestConfig } from 'axios'

const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8001',
})

// TODO: Uncomment once AWS Cognito auth is configured.
// axiosInstance.interceptors.request.use(async (config) => {
//   const token = await getCognitoToken()
//   config.headers.Authorization = `Bearer ${token}`
//   return config
// })

class APIClient<T> {
  constructor(public endpoint: string) {}

  getAll = (config?: AxiosRequestConfig) =>
    axiosInstance.get<T>(this.endpoint, config).then((res) => res.data)

  get = (id: string | number) =>
    axiosInstance.get<T>(`${this.endpoint}/${id}`).then((res) => res.data)

  post = (data: unknown, config?: AxiosRequestConfig) =>
    axiosInstance.post<T>(this.endpoint, data, config).then((res) => res.data)

  put = (id: string | number, data: unknown) =>
    axiosInstance.put<T>(`${this.endpoint}/${id}`, data).then((res) => res.data)

  patch = (data: unknown, config?: AxiosRequestConfig) =>
    axiosInstance.patch<T>(this.endpoint, data, config).then((res) => res.data)

  delete = (id: string | number) =>
    axiosInstance.delete<void>(`${this.endpoint}/${id}`).then((res) => res.data)
}

export { axiosInstance }
export default APIClient
