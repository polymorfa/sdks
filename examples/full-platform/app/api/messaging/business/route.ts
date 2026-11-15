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
export const POST = route("admin", async ({ body, connectionOf }) => {
  const business = messaging().business;
  const connection = connectionOf(body);
  const name = action(body);
  switch (name) {
    case "profile":
      return business.getProfile(connection);
    case "updateProfile":
      return business.updateProfile(connection, {
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
      return business.setCoverPhoto(connection, { url: text(body, "url") });
    case "deleteCoverPhoto":
      return business.deleteCoverPhoto(connection, text(body, "coverPhotoId"));
    case "catalog": {
      const after = optionalText(body, "after");
      return business.getCatalog(connection, {
        id: text(body, "businessId"),
        limit: optionalInteger(body, "limit") ?? 20,
        ...(after === undefined ? {} : { after }),
      });
    }
    case "createCatalog":
      return business.createCatalog(connection);
    case "setCartEnabled":
      return business.setCartEnabled(connection, {
        enabled: flag(body, "enabled"),
      });
    case "product":
      return business.getProduct(connection, text(body, "productId"), {
        id: text(body, "businessId"),
      });
    case "createProduct":
      return business.createProduct(connection, product(body));
    case "updateProduct":
      return business.updateProduct(
        connection,
        text(body, "productId"),
        product(body),
      );
    case "deleteProduct":
      return business.deleteProduct(connection, text(body, "productId"));
    case "setProductVisibility":
      return business.setProductVisibility(connection, text(body, "productId"), {
        hidden: flag(body, "hidden"),
      });
    case "appealProduct":
      return business.appealProduct(connection, text(body, "productId"), {
        reason: text(body, "reason"),
      });
    case "collections":
      return business.listCollections(connection, {
        id: text(body, "businessId"),
        collectionLimit: 10,
      });
    case "collection":
      return business.getCollection(connection, text(body, "collectionId"), {
        id: text(body, "businessId"),
      });
    case "createCollection":
      return business.createCollection(connection, {
        name: text(body, "name"),
        productIds: texts(body, "productIds"),
      });
    case "updateCollection":
      return business.updateCollection(connection, text(body, "collectionId"), {
        name: text(body, "name"),
      });
    case "deleteCollection":
      return business.deleteCollection(connection, text(body, "collectionId"));
    case "reorderCollections":
      return business.reorderCollections(connection, {
        moves: [
          {
            collectionId: text(body, "collectionId"),
            fromIndex: optionalInteger(body, "fromIndex") ?? 0,
            toIndex: optionalInteger(body, "toIndex") ?? 1,
          },
        ],
      });
    case "appealCollection":
      return business.appealCollection(connection, text(body, "collectionId"), {
        reason: text(body, "reason"),
      });
    case "order":
      return business.getOrder(connection, text(body, "orderId"), {
        token: text(body, "token"),
      });
    case "merchantCompliance":
      return business.getMerchantCompliance(connection);
    case "setMerchantCompliance": {
      const contact = {
        email: "care@acme.test",
        landlineNumber: "+15550100",
        mobileNumber: "+15550101",
      };
      return business.setMerchantCompliance(connection, {
        entityName: "Acme Inc.",
        entityType: "PRIVATE_COMPANY",
        isRegistered: true,
        entityTypeCustom: "",
        customerCare: contact,
        grievanceOfficer: { ...contact, name: "Casey Rivera" },
      });
    }
    case "linkedAccounts":
      return business.getLinkedAccounts(connection);
    case "eligibility":
      return business.getEligibility(connection);
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
