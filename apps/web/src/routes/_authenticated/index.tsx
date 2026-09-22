export function DashboardPage() {
  return (
    <main className="dashboard-page">
      <div className="page-heading">
        <div>
          <h1>Dashboard</h1>
          <p>Welcome to the SherHisab foundation.</p>
        </div>
      </div>

      <section className="dashboard-grid" aria-label="Foundation status">
        <article>
          <span>Workspace</span>
          <strong>Ready</strong>
        </article>
        <article>
          <span>Tenant context</span>
          <strong>Protected</strong>
        </article>
        <article>
          <span>Database</span>
          <strong>PostgreSQL</strong>
        </article>
      </section>
    </main>
  )
}
