import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Nav from './components/Nav'
import Feed from './pages/Feed'
import Filters from './pages/Filters'

export default function App() {
  return (
    <BrowserRouter>
      <Nav />
      <Routes>
        <Route path="/" element={<Feed />} />
        <Route path="/filters" element={<Filters />} />
      </Routes>
    </BrowserRouter>
  )
}
