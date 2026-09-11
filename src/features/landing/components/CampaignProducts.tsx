import Image from "next/image";
import Link from "next/link";

import { CampaignContainer } from "@/components/campaign/CampaignContainer";
import { CampaignSection } from "@/components/campaign/CampaignSection";

/**
 * The three "3 Pilares" bullets and "Ingredientes clave" have no source
 * of truth anywhere in the project (docs, CMS, or prior copy) — only
 * each product's existing marketing description does, reused below as
 * "Por qué es diferente". Rather than inventing claims, those two
 * fields carry a visibly-marked placeholder until the client supplies
 * real content.
 */
const PENDING_PILLAR = "Pilar pendiente de definir";
const PENDING_INGREDIENTS = "Información de ingredientes pendiente de confirmar.";

const products = [
  {
    name: "Sensyderm Baño Shampoo Infant",
    whyDifferent:
      "Protección dermo-pediátrica ideal para recién nacidos: sin fragancia, cuida el microbioma y protege desde el día uno.",
    image: "/campaign/products/sensy-derm-infant.png",
    url: "https://bassa.com.ec/dermatologia/producto/sensy-derm-infant-bano-shampoo-300-ml/",
    pillars: ["Protege la barrera natural", "Limpia suavemente", "Respeta la piel sensible"],
    ingredients: ["Probióticos, ", "Ectoína, ", "Hipoalergénico"],
  },
  {
    name: "Sensyderm Baño Shampoo Baby",
    whyDifferent:
      "Fue desarrollado para acompañar el desarrollo natural de la piel del bebé, ayudando a proteger su equilibrio desde el primer baño.",
    image: "/campaign/products/packshot-sensyderm.png",
    url: "https://bassa.com.ec/dermatologia/producto/sensy-derm-baby-bano-shampoo-400-ml/",
    pillars: ["Protege el microbioma", "Fortalece la defensa natural", "Respeta la piel sensible"],
    ingredients: ["Probióticos, ", "Ectoína, ", "Hipoalergénico"],
  },
  {
    name: "Sensyderm Baby Crema Protectora",
    whyDifferent:
      "Escudo antiescaldaduras de rápida absorción: protege la zona del pañal sin pesadez y sin dejar la piel blanca.",
    image: "/campaign/products/packshot-sensyderm-crema.png",
    url: "https://bassa.com.ec/dermatologia/producto/sensy-derm-baby-crema-protectora-70g/",
    pillars: [
      "Protege frente a la humedad",
      "Forma una barrera protectora",
      "Ayuda a calmar e hidratar",
    ],
    ingredients: ["Pantenol, ", "Ectoína, ", "Complejo de Probióticos"],
  },
];

/**
 * Its own top-level Landing section (previously nested at the bottom of
 * the now-removed `CampaignExplanation`) — `CampaignSection` gives it the
 * same `spacing="xl"` vertical rhythm every other Landing section uses,
 * so removing the wrapping section didn't change this component's own
 * spacing consistency.
 */
export function CampaignProducts() {
  return (
    <CampaignSection tone="muted">
      <CampaignContainer>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {products.map((product) => (
            <article
              key={product.name}
              className="flex flex-col overflow-hidden rounded-[32px] border border-slate-200/70 bg-white shadow-xl shadow-sky-100/40 transition-transform duration-200 hover:-translate-y-1"
            >
              <div className="relative h-[320px] w-full shrink-0">
                <Image
                  src={product.image}
                  alt={product.name}
                  fill
                  className="object-contain p-6"
                  sizes="(max-width:768px) 100vw, 320px"
                />
              </div>

              <div className="flex flex-1 flex-col gap-6 p-8">
                <div>
                  <h3 className="text-xl font-semibold text-slate-900">{product.name}</h3>
                </div>

                <div>
                  <h4 className="text-body font-semibold text-violet-600">Por qué es diferente</h4>
                  <p className="mt-2 text-body text-muted-foreground">{product.whyDifferent}</p>
                </div>

                <div>
                  <h4 className="text-body font-semibold text-violet-600">3 Pilares</h4>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-body text-muted-foreground">
                    {product.pillars.map((pillar, index) => (
                      <li key={`${product.name}-pillar-${index}`}>{pillar}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h4 className="text-body font-semibold text-violet-600">Ingredientes clave</h4>
                  <p className="mt-2 text-body text-muted-foreground">{product.ingredients}</p>
                </div>

                <Link
                  href={product.url}
                  className="mt-auto inline-flex w-full items-center justify-center rounded-full bg-violet-600 px-8 py-3 text-base font-semibold text-white transition-colors hover:bg-violet-700"
                >
                  Comprar
                </Link>
              </div>
            </article>
          ))}
        </div>
      </CampaignContainer>
    </CampaignSection>
  );
}
