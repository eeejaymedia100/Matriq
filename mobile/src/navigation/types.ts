import type { NavigatorScreenParams } from "@react-navigation/native";

export type AuthStackParamList = {
  Onboarding: undefined;
  Welcome: undefined;
  Login: undefined;
  RegisterChoice: undefined;
  RegisterStaylite: undefined;
  RegisterFresher: undefined;
  VerifyEmail: { email: string };
};

/** Bottom nav — five tabs (spec §3): Home · Vault · Tools · Study · Settings. */
export type MainTabParamList = {
  Home: undefined;
  Vault: undefined;
  Tools: undefined;
  Study: undefined;
  Settings: undefined;
};

export type MainStackParamList = {
  CompleteProfile: undefined;
  Home: NavigatorScreenParams<MainTabParamList>;
  PayFee: { feeId: string };
  Receipt: { paymentId: string };
  Referrals: undefined;
  Profile: undefined;
  Explore: undefined;
  Events: undefined;
  Fees: undefined;
  VerificationUpload: undefined;
  VerificationStatus: undefined;
  OfflineModels: undefined;
};
