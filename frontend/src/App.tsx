import { createBrowserRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { basename, routes } from './routes.tsx'

// Addresses are relative to the app's base: Vite's `base`, the site's root.
const router = createBrowserRouter(routes, { basename: basename() })

export default function App() {
  return <RouterProvider router={router} />
}
