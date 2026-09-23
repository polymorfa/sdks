import { messaging } from "../../../../lib/polymorfa.js";
import {
  action,
  flag,
  optionalInteger,
  optionalText,
  route,
  text,
  texts,
  unknownAction,
  type Body,
} from "../../../../lib/route.js";

// Business App profile and commerce. Most reads take the business user id.
export const POST = route("admin", async ({ body, sessionOf }) => {
  const business = messaging().business;
  const session = sessionOf(body);
  const name = action(body);
  switch (name) {
    case "profile":
      return business.getProfile(session);
    case "updateProfile":
      return business.updateProfile(session, {
        description: text(body, "description"),
        websites: ["https://acme.test"],
        hours: {
          timeZone: "America/New_York",
          days: [
            {
              dayOfWeek: "mon",
              mode: "specific_hours",
              openTime: 9 * 60,
              closeTime: 17 * 60,
            },
            { dayOfWeek: "sat", mode: "appointment_only" },
          ],
        },
      });
    case "setCoverPhoto":
      return business.setCoverPhoto(session, { url: text(body, "url") });
    case "deleteCoverPhoto":
      return business.deleteCoverPhoto(session, text(body, "coverPhotoId"));
    case "catalog": {
      const after = optionalText(body, "after");
      return business.getCatalog(session, {
        id: text(body, "businessId"),
        limit: optionalInteger(body, "limit") ?? 20,
        ...(after === undefined ? {} : { after }),
      });
    }
    case "createCatalog":
      return business.createCatalog(session);
    case "setCartEnabled":
      return business.setCartEnabled(session, {
        enabled: flag(body, "enabled"),
      });
    case "product":
      return business.getProduct(session, text(body, "productId"), {
        id: text(body, "businessId"),
      });
    case "createProduct":
      return business.createProduct(session, product(body));
    case "updateProduct":
      return business.updateProduct(
        session,
        text(body, "productId"),
        product(body),
      );
    case "deleteProduct":
      return business.deleteProduct(session, text(body, "productId"));
    case "setProductVisibility":
      return business.setProductVisibility(session, text(body, "productId"), {
        hidden: flag(body, "hidden"),
      });
    case "appealProduct":
      return business.appealProduct(session, text(body, "productId"), {
        reason: text(body, "reason"),
      });
    case "collections":
      return business.listCollections(session, {
        id: text(body, "businessId"),
        collectionLimit: 10,
      });
    case "collection":
      return business.getCollection(session, text(body, "collectionId"), {
        id: text(body, "businessId"),
      });
    case "createCollection":
      return business.createCollection(session, {
        name: text(body, "name"),
        productIds: texts(body, "productIds"),
      });
    case "updateCollection":
      return business.updateCollection(session, text(body, "collectionId"), {
        name: text(body, "name"),
      });
    case "deleteCollection":
      return business.deleteCollection(session, text(body, "collectionId"));
    case "reorderCollections":
      return business.reorderCollections(session, {
        moves: [
          {
            collectionId: text(body, "collectionId"),
            fromIndex: optionalInteger(body, "fromIndex") ?? 0,
            toIndex: optionalInteger(body, "toIndex") ?? 1,
          },
        ],
      });
    case "appealCollection":
      return business.appealCollection(session, text(body, "collectionId"), {
        reason: text(body, "reason"),
      });
    case "order":
      return business.getOrder(session, text(body, "orderId"), {
        token: text(body, "token"),
      });
    case "merchantCompliance":
      return business.getMerchantCompliance(session);
    case "setMerchantCompliance": {
      const contact = {
        email: "care@acme.test",
        landlineNumber: "+15550100",
        mobileNumber: "+15550101",
      };
      return business.setMerchantCompliance(session, {
        entityName: "Acme Inc.",
        entityType: "PRIVATE_COMPANY",
        isRegistered: true,
        entityTypeCustom: "",
        customerCare: contact,
        grievanceOfficer: { ...contact, name: "Casey Rivera" },
      });
    }
    case "linkedAccounts":
      return business.getLinkedAccounts(session);
    case "eligibility":
      return business.getEligibility(session);
    default:
      return unknownAction(name);
  }
});

function product(body: Body) {
  const price = optionalText(body, "price");
  return {
    name: text(body, "name"),
    currency: "USD",
    ...(price === undefined ? {} : { price }),
    images: [{ url: text(body, "imageUrl") }],
  };
}
