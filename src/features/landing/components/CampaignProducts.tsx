import Image from "next/image";
import Link from "next/link";

import { CampaignContainer } from "@/components/campaign/CampaignContainer";
import { CampaignSection } from "@/components/campaign/CampaignSection";

const products = [
  {
    name: "Sensyderm Baño Shampoo Infant",
    description:
      "Protección dermo-pediátrica ideal para recién nacidos: sin fragancia, cuida el microbioma y protege desde el día uno.",
    image: "/campaign/products/sensy-derm-infant.png",
    url: "https://bassa.com.ec/dermatologia/producto/sensy-derm-infant-bano-shampoo-300-ml/",
  },
  {
    name: "Sensyderm Baño Shampoo Baby",
    description:
      "Cuidado inteligente y un aroma delicado que protege las defensas naturales del bebé en una rutina diaria sin lágrimas.",
    image: "/campaign/products/packshot-sensyderm.png",
    url: "https://bassa.com.ec/dermatologia/producto/sensy-derm-baby-bano-shampoo-400-ml/",
  },
  {
    name: "Sensyderm Baby Crema Protectora",
    description:
      "Escudo antiescaldaduras de rápida absorción: protege la zona del pañal sin pesadez y sin dejar la piel blanca.",
    image: "/campaign/products/packshot-sensyderm-crema.png",
    url: "https://bassa.com.ec/dermatologia/producto/sensy-derm-baby-crema-protectora-70g/",
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
              className="flex flex-col items-center rounded-[32px] border border-slate-200/70 bg-white p-8 shadow-xl shadow-sky-100/40 transition-transform duration-200 hover:-translate-y-1"
            >
              <div className="relative h-[320px] w-full">
                <Image
                  src={product.image}
                  alt={product.name}
                  fill
                  className="object-contain"
                  sizes="(max-width:768px) 100vw, 320px"
                />
              </div>

              <Link
                href={product.url}
                className="mt-8 inline-flex min-w-[160px] items-center justify-center rounded-full bg-violet-600 px-8 py-3 text-base font-medium text-white transition-colors hover:bg-violet-700"
              >
                Comprar
              </Link>

              <h3 className="mt-8 text-center text-xl font-semibold text-slate-900">
                {product.name}
              </h3>

              <p className="mt-3 max-w-xs text-center text-body text-muted-foreground">
                {product.description}
              </p>
            </article>
          ))}
        </div>
      </CampaignContainer>
    </CampaignSection>
  );
}
