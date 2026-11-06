import { encode } from 'uqr';

export function QrCode({ value, label, size = 184 }: { value: string; label: string; size?: number }) {
  const { data } = encode(value, { ecc: 'M', border: 2 });
  const n = data.length;
  let path = '';
  for (let y = 0; y < n; y++) {
    const row = data[y]!;
    for (let x = 0; x < n; x++) {
      if (row[x]) path += `M${x} ${y}h1v1h-1z`;
    }
  }
  return (
    <svg role="img" aria-label={label} width={size} height={size} viewBox={`0 0 ${n} ${n}`} shapeRendering="crispEdges" className="block bg-white">
      <path d={path} fill="#0b0b0c" />
    </svg>
  );
}
