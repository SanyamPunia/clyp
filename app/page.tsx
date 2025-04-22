import { Clyp } from "@/components/screenshot-beautifier"
import Link from "next/link"
import { Schoolbell } from 'next/font/google'

const schoolbell = Schoolbell({
  weight: '400',
  subsets: ['latin'],
  fallback: ['sans-serif'],
})

export default function Home() {
  return (
    <main className="p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-2">
          <Link href="/">
            <h1 className={`text-xl font-medium mb-1 ${schoolbell.className}`}>clyp 📺</h1>
          </Link>
          <p className="text-xs text-muted-foreground">
            Upload or paste your screenshot and customize it with beautiful backgrounds and styling
          </p>
        </div>
        <Clyp />
      </div>
    </main>
  )
}
