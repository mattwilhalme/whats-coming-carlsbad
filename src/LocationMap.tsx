const mapsKey = import.meta.env.VITE_GOOGLE_MAPS_EMBED_KEY as string | undefined;

type LocationMapProps = {
  address: string;
  label: string;
};

export const isLocationMapConfigured = Boolean(mapsKey);

export default function LocationMap({ address, label }: LocationMapProps) {
  if (!mapsKey) return null;

  const src = `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(mapsKey)}&q=${encodeURIComponent(address)}&zoom=15`;

  return <div className="location-map">
    <iframe
      title={`Map showing ${label}`}
      src={src}
      loading="lazy"
      allowFullScreen
      referrerPolicy="no-referrer-when-downgrade"
    />
  </div>;
}
