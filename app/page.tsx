export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-2xl mx-auto px-4 text-center">
        <h1 className="text-4xl font-bold text-slate-900 mb-4">
          Welcome to Rent Stream
        </h1>
        <p className="text-lg text-slate-600 mb-8">
          AI-powered rental property management platform
        </p>
        <div className="flex gap-4 justify-center">
          <button className="px-6 py-3 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors">
            Get Started
          </button>
          <button className="px-6 py-3 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors">
            Learn More
          </button>
        </div>
      </div>
    </div>
  )
}
