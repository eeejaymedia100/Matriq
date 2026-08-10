import type { NavigatorScreenParams } from "@react-navigation/native";

export type AuthStackParamList = {
  Welcome: undefined;
  Login: undefined;
  RegisterChoice: undefined;
  RegisterStaylite: undefined;
  RegisterFresher: undefined;
};

export type MainTabParamList = {
  Dashboard: undefined;
  Fees: undefined;
  Announcements: undefined;
  Events: undefined;
  AI: undefined;
};

export type MainStackParamList = {
  Home: NavigatorScreenParams<MainTabParamList>;
  PayFee: { feeId: string };
  Receipt: { paymentId: string };
  Referrals: undefined;
  Profile: undefined;
  Explore: undefined;
  VerificationUpload: undefined;
  VerificationStatus: undefined;
};
