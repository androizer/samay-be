import { z } from "zod";
import {
  CREATE_INVITATION_SCHEMA,
  ACCEPT_INVITATION_SCHEMA,
  INVITATION_QUERY_SCHEMA,
} from "./schema";

export type CreateInvitationInput = z.infer<typeof CREATE_INVITATION_SCHEMA>;
export type AcceptInvitationInput = z.infer<typeof ACCEPT_INVITATION_SCHEMA>;
export type InvitationQuery = z.infer<typeof INVITATION_QUERY_SCHEMA>;

export interface InvitationResponse {
  id: string;
  email: string;
  role: string;
  token: string;
  expiresAt: Date;
  inviter: {
    name: string | null;
    email: string;
  };
  createdAt: Date;
}
