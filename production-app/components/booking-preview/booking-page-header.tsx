export function BookingPageHeader({salonName}: {salonName: string}) {
  return (
    <header className="bp-header">
      <div>
        <p className="bp-salon">{salonName}</p>
        <span className="bp-powered">aesthenda</span>
      </div>
      <span className="bp-header-label">Book your next visit</span>
    </header>
  );
}
