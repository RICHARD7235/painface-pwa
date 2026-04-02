import Link from "next/link";

const NAV_ITEMS = [
  {
    href: "/monitor",
    label: "Monitor",
    sublabel: "Suivi de la douleur en temps reel",
    icon: "\u{1F4CA}",
    className: "bg-indigo-600 hover:bg-indigo-700 text-white",
  },
  {
    href: "/patients",
    label: "Patients",
    sublabel: "Liste et gestion des patients",
    icon: "\u{1F465}",
    className:
      "bg-white hover:bg-gray-50 text-gray-800 border border-gray-200",
  },
  {
    href: "/history",
    label: "Historique",
    sublabel: "Dernieres seances enregistrees",
    icon: "\u{1F4C5}",
    className:
      "bg-white hover:bg-gray-50 text-gray-800 border border-gray-200",
  },
  {
    href: "/camera",
    label: "Camera",
    sublabel: "Analyse faciale en direct",
    icon: "\u{1F3A5}",
    className: "bg-blue-700 hover:bg-blue-800 text-white",
  },
  {
    href: "/settings",
    label: "Reglages",
    sublabel: "Seuils, lissage et calibration",
    icon: "\u2699\uFE0F",
    className:
      "bg-white hover:bg-gray-50 text-gray-800 border border-gray-200",
  },
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50 px-6 pt-12 pb-8">
      <div className="mx-auto w-full max-w-md">
        {/* Header */}
        <h1 className="mb-1 text-3xl font-bold text-gray-900">PainFace</h1>
        <p className="mb-8 text-base text-gray-500">
          Analyse faciale de la douleur pour la physiotherapie
        </p>

        {/* Navigation buttons */}
        <nav className="flex flex-col gap-4">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-4 rounded-2xl px-6 py-4 shadow-sm transition-colors ${item.className}`}
            >
              <span className="text-2xl" role="img" aria-hidden="true">
                {item.icon}
              </span>
              <div className="flex flex-col">
                <span className="text-lg font-semibold">{item.label}</span>
                <span className="text-sm opacity-70">{item.sublabel}</span>
              </div>
            </Link>
          ))}
        </nav>

        {/* Medical disclaimer */}
        <div className="mt-10 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          <p className="mb-1 font-semibold">Avertissement medical</p>
          <p className="leading-relaxed">
            PainFace est un outil d&apos;aide a l&apos;observation destine aux
            professionnels de sante. Il ne constitue pas un dispositif medical
            certifie et ne remplace en aucun cas un diagnostic clinique. Les
            scores affiches sont des estimations basees sur les Action Units
            faciales (FACS) et doivent etre interpretes par un praticien
            qualifie.
          </p>
        </div>
      </div>
    </div>
  );
}
