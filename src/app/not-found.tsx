import Link from 'next/link'

export default function NotFound() {
  return (
    <main>
      <h2>404 - Page non trouvée</h2>
      <Link href="/">Retour à l'accueil</Link>
    </main>
  )
}