export default function Home() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(to bottom right, #f8fafc, #f1f5f9)',
    }}>
      <div style={{
        maxWidth: '42rem',
        margin: '0 auto',
        padding: '0 1rem',
        textAlign: 'center',
      }}>
        <h1 style={{
          fontSize: '2.25rem',
          fontWeight: 700,
          color: '#0f172a',
          marginBottom: '1rem',
        }}>
          Welcome to Rent Stream
        </h1>
        <p style={{
          fontSize: '1.125rem',
          color: '#475569',
          marginBottom: '2rem',
        }}>
          AI-powered rental property management platform
        </p>
        <div style={{
          display: 'flex',
          gap: '1rem',
          justifyContent: 'center',
        }}>
          <button style={{
            padding: '0.75rem 1.5rem',
            background: '#0f172a',
            color: 'white',
            borderRadius: '0.5rem',
            border: 'none',
            cursor: 'pointer',
            fontSize: '1rem',
          }}>
            Get Started
          </button>
          <button style={{
            padding: '0.75rem 1.5rem',
            background: 'white',
            color: '#334155',
            borderRadius: '0.5rem',
            border: '1px solid #cbd5e1',
            cursor: 'pointer',
            fontSize: '1rem',
          }}>
            Learn More
          </button>
        </div>
      </div>
    </div>
  )
}
