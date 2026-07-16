import { useRouteError, isRouteErrorResponse, Link } from 'react-router-dom'

const ErrorPage = () => {
  const error = useRouteError()
  const message = isRouteErrorResponse(error)
    ? error.statusText
    : error instanceof Error
      ? error.message
      : 'An unexpected error occurred'

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4 px-4">
      <h1 className="text-3xl font-bold text-slate-900">Oops</h1>
      <p className="text-slate-600 text-sm max-w-md text-center">{message}</p>
      <Link
        to="/"
        className="px-4 py-2 bg-slate-900 text-white text-sm rounded hover:bg-slate-700"
      >
        Back to Home
      </Link>
    </div>
  )
}

export default ErrorPage
