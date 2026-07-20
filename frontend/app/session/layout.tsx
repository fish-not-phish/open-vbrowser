export default function SessionLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`body::before { display: none !important; }`}</style>
      {children}
    </>
  )
}
