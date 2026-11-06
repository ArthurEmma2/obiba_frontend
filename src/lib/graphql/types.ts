export type AccountStatus = 'provisioning' | 'active' | 'quarantined' | 'frozen';

export interface Me {
  uid: string;
  displayName: string;
  phone: string;
  email: string;
  handle: string | null;
  accountName: string | null;
  viewOnly: boolean;
  pilotAllowed: boolean;
  merchant: boolean;
  accountId: string | null;
  accountStatus: AccountStatus | null;
}

export interface DeviceView {
  publicKey: string;
  status: 'pending' | 'active' | 'revoked';
  initial: boolean;
  createdAt: string;
}

export interface RecoveryKitStatus {
  active: boolean;
  publicKey: string | null;
  createdAt: string | null;
}

export interface AccountNameAvailability {
  name: string;
  accountId: string | null;
  available: boolean;
  reason: string | null;
  suggestions: string[];
}

export interface DeviceResult {
  publicKey: string;
  status: string;
  provisioningQueued: boolean;
}

export interface AccountEvent {
  kind: string;
  id: string;
  status: string;
}

export interface CreateAccountInput {
  email: string;
  password: string;
  displayName: string;
  turnstileToken: string;
}

export interface RegisterProfileInput {
  displayName: string;
  phone: string;
  handle: string | null;
  accountName: string;
}

export interface Balance {
  domain: 'REAL' | 'DEMO';
  currency: string;
  posted: string;
  held: string;
  available: string;
}

export interface AccountView {
  accountId: string | null;
  explorerUrl: string | null;
  network: string;
  status: string | null;
  usdcContract: string;
}

export interface SpendingLimit {
  currency: string;
  dailyLimit: string;
  spent24h: string;
  remaining: string;
  maxOpAmount: string;
  pendingLimit: string | null;
  pendingLimitEffectiveAt: string | null;
  frozenUntil: string | null;
  recoveryExecutableAt: string | null;
}

export interface PendingItem {
  id: string;
  kind: 'TRANSFER' | 'INVOICE_PAYMENT' | 'DEPOSIT' | 'WITHDRAWAL' | string;
  status: string;
  amount: string;
  currency: string;
  counterparty: string | null;
  createdAt: string;
}

export interface ActivityItem {
  id: string;
  kind: string;
  direction: 'IN' | 'OUT';
  status: string;
  amount: string;
  currency: string;
  counterparty: string | null;
  counterpartyName: string | null;
  createdAt: string;
  opId: string | null;
  txHash: string | null;
  explorerUrl: string | null;
  domain: 'REAL' | 'DEMO';
}

export interface TransactionView {
  id: string;
  type: string;
  status: string;
  amount: string;
  asset: string;
  fee: string | null;
  recipient: string | null;
  sourceNetwork: string | null;
  destinationNetwork: string | null;
  explorerUrls: string[];
  references: string[];
  notice: string | null;
  createdAt: string;
  domain: string;
}

export interface Recipient {
  kind: 'OBIBA' | 'NEAR' | string;
  accountId: string;
  displayName: string | null;
  handle: string | null;
  canReceive: boolean;
}

export interface PreparedOp {
  opId: string;
  accountId: string;
  methodName: string;
  argsBase64: string;
  amount: string;
  receiver: string;
  deviceOpHash: string;
  expiresAtNs: string;
}

export interface UnsignedDelegate {
  accountId: string;
  delegateBase64: string;
  signingHashHex: string;
  methodName: string;
  nonce: string;
  maxBlockHeight: string;
}

export interface OpView {
  opId: string;
  kind: string;
  status: string;
  amount: string;
  receiver: string;
  invoiceId: string | null;
  txHashes: string[];
  explorerUrls: string[];
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceView {
  invoiceId: string;
  merchantName: string;
  merchantAccount: string;
  amount: string;
  token: string;
  feeBps: number;
  status: string;
  expiresAtNs: string;
  paymentUrl: string;
  crossChainEnabled: boolean;
}

export interface QuoteFees {
  source: string;
  appFeeBps: number;
  amountInUsd: string | null;
  amountOutUsd: string | null;
  providerSpreadUsd: string | null;
}

export interface QuoteView {
  amountIn: string;
  amountOut: string;
  minAmountIn: string;
  minAmountOut: string;
  asset: string;
  deadline: string;
  totalDebit: string;
  timeEstimateSeconds: number | null;
  fees: QuoteFees;
}

export interface WithdrawalOption {
  key: string;
  label: string;
  network: string;
}

export interface WithdrawalView {
  withdrawalId: string;
  status: string;
  destination: string;
  recipient: string;
  amountIn: string;
  amountOut: string;
  minAmountOut: string;
  fees: QuoteFees;
  timeEstimateSeconds: number | null;
  nearTxHash: string | null;
  destinationTxHashes: string[];
  createdAt: string;
}

export interface DepositOption {
  key: string;
  label: string;
  decimals: number;
  minUsd: number;
}

export interface DepositInstructions {
  depositId: string;
  status: string;
  origin: string;
  depositAddress: string;
  depositMemo: string | null;
  amountIn: string;
  minAmountIn: string;
  minAmountOut: string;
  deadline: string;
  timeEstimateSeconds: number | null;
  fees: QuoteFees;
  originTxHashes: string[];
  nearTxHashes: string[];
  nearExplorerUrls: string[];
  createdAt: string | null;
}

export interface DirectDeposit {
  address: string;
  network: string;
  token: string;
  tokenContract: string;
}

export interface IndicativeRate {
  base: string;
  quote: string;
  rate: string;
  source: string;
  asOf: string;
}

export interface SandboxService {
  kind: string;
  label: string;
  direction: 'CREDIT' | 'DEBIT' | string;
  providers: string[];
  target: 'phone' | 'bank_account' | 'meter' | 'water_account' | 'smartcard' | string;
  feeBps: number;
  usesProducts: boolean;
}

export interface SandboxProduct {
  id: string;
  provider: string;
  label: string;
  priceGhs: string;
}

export interface SandboxCatalog {
  currency: string;
  simulatedRate: string | null;
  rateSource: string | null;
  rateAsOf: string | null;
  notice: string;
  services: SandboxService[];
  products: SandboxProduct[];
}

export interface SandboxRequestInput {
  kind: string;
  provider?: string | null;
  target: string;
  amountGhs?: string | null;
  productId?: string | null;
  recipientName?: string | null;
}

export interface SandboxQuote {
  kind: string;
  direction: string;
  provider: string;
  target: string;
  productId: string | null;
  productLabel: string | null;
  amountGhs: string | null;
  feeGhs: string | null;
  totalGhs: string | null;
  country: string;
  localCurrency: string;
  amountLocal: string;
  feeLocal: string;
  totalLocal: string;
  amount: string;
  fee: string;
  total: string;
  currency: string;
  simulatedRate: string;
  rateSource: string;
  rateAsOf: string | null;
  notice: string;
}

export interface SandboxReceipt {
  id: string;
  kind: string;
  provider: string;
  target: string;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REVIEW' | string;
  amount: string;
  amountGhs: string | null;
  feeGhs: string | null;
  country: string | null;
  localCurrency: string | null;
  amountLocal: string | null;
  feeLocal: string | null;
  currency: string;
  token: string | null;
  notice: string;
  createdAt: string;
  funding: string;
  opId: string | null;
  invoiceId: string | null;
  recipientName: string | null;
}

export interface RemittanceMethod {
  kind: string;
  type: 'MOBILE_MONEY' | 'BANK' | string;
  label: string;
  providers: string[];
  target: string;
  feeBps: number;
}

export interface RemittanceCorridor {
  country: string;
  countryName: string;
  currency: string;
  maxAmount: string;
  provider: string;
  rate: string | null;
  rateSource: string | null;
  rateAsOf: string | null;
  methods: RemittanceMethod[];
}

export interface NotificationView {
  id: string;
  kind: string;
  ref: string | null;
  read: boolean;
  createdAt: string;
}

export interface MerchantInvoice {
  invoiceId: string;
  amount: string;
  feeBps: number;
  expiresAtNs: string;
  reference: string | null;
  status: string;
  createdAt: string;
  payer: string | null;
  fee: string | null;
  net: string | null;
  paidTxHash: string | null;
  paidExplorerUrl: string | null;
  paidAt: string | null;
  paymentUrl: string;
}

export interface CreatedInvoice {
  invoiceId: string;
  amount: string;
  feeBps: number;
  expiresAtNs: string;
  paymentUrl: string;
}

export interface InvoicePayment {
  paymentId: string;
  invoiceId: string;
  status: string;
  origin: string;
  depositAddress: string;
  depositMemo: string | null;
  amountIn: string;
  minAmountIn: string;
  deadline: string;
  timeEstimateSeconds: number | null;
  originTxHashes: string[];
}

export interface SupportCaseView {
  caseId: string;
  status: string;
  newPublicKey: string;
  createdAt: string;
  earliestAt: string;
  closedReason: string | null;
}

export interface SupportRequestStatus {
  status: string;
  earliestAt: string;
  closedReason: string | null;
  recoveryStatus: string | null;
  movesAt: string | null;
  activated: boolean;
}

export interface RecoveryView {
  recoveryId: string;
  status: string;
  newPublicKey: string;
  executableAt: string | null;
  reason: string | null;
  createdAt: string;
}

export interface AccountCall {
  callId: string;
  accountId: string;
  methodName: string;
  argsBase64: string;
  status: string;
  newLimit: string | null;
  token?: string | null;
  effectiveAt: string | null;
}

export interface Wallet {
  me: Me;
  balances: Balance[];
  account: AccountView;
  pendingActivity: PendingItem[];
  activity: ActivityItem[];
}

export interface WithdrawalInput {
  amount: string;
  destination: string;
  recipientAddress: string;
}

export interface DepositInput {
  amount: string;
  origin: string;
  refundAddress: string;
}

export interface OperationResults {
  Me: { me: Me };
  SetupStatus: { devices: DeviceView[]; recoveryKit: RecoveryKitStatus };
  AccountNameAvailability: { accountNameAvailability: AccountNameAvailability };
  CreateAccount: { createAccount: boolean };
  RegisterProfile: { registerProfile: Me };
  RegisterDevice: { registerDevice: DeviceResult };
  RegisterRecoveryKit: { registerRecoveryKit: RecoveryKitStatus };
  SignOutEverywhere: { signOutEverywhere: boolean };
  BeginViewOnlySession: { beginViewOnlySession: boolean };
  AccountEvents: { accountEvents: AccountEvent };
  Wallet: Wallet;
  SpendingLimit: { spendingLimit: SpendingLimit };
  LocalBalance: { demoBalance: Balance; sandboxCatalog: { simulatedRate: string | null } };
  Activity: { activity: ActivityItem[] };
  Transaction: { transaction: TransactionView | null };
  Recipient: { recipient: Recipient | null };
  PrepareTransfer: { prepareTransfer: PreparedOp };
  Invoice: { invoice: InvoiceView | null };
  PrepareInvoicePayment: { prepareInvoicePayment: PreparedOp };
  RequestCosign: { requestCosign: PreparedOp };
  BuildDelegate: { buildDelegate: UnsignedDelegate };
  SubmitSignedOp: { submitSignedOp: { opId: string; status: string; delegateHash: string } };
  Op: { op: OpView | null };
  Receive: { account: AccountView; directDeposit: DirectDeposit; depositOptions: DepositOption[] };
  QuoteDeposit: { quoteDeposit: QuoteView };
  StartDeposit: { startDeposit: DepositInstructions };
  Deposit: { deposit: DepositInstructions | null };
  WithdrawalOptions: { withdrawalOptions: WithdrawalOption[] };
  QuoteWithdrawal: { quoteWithdrawal: QuoteView };
  PrepareWithdrawal: { prepareWithdrawal: { op: PreparedOp; withdrawal: WithdrawalView } };
  Withdrawal: { withdrawal: WithdrawalView | null };
  BalanceChanged: { balanceChanged: AccountEvent };
  TransactionUpdated: { transactionUpdated: AccountEvent };
  DepositUpdated: { depositUpdated: AccountEvent };
  RemittanceCorridors: { remittanceCorridors: RemittanceCorridor[]; demoBalance: Balance };
  CancelRecoveryCall: { cancelRecoveryCall: { accountId: string; methodName: string; argsBase64: string } };
  CancelRecovery: { cancelRecovery: RecoveryView };
  StartRecovery: { startRecovery: RecoveryView };
  ConfirmPhone: { confirmPhone: boolean };
  SupportCase: { supportCase: SupportCaseView | null };
  OpenSupportRecovery: { openSupportRecovery: SupportCaseView };
  CancelSupportRecovery: { cancelSupportRecovery: SupportCaseView };
  RequestSupportRecovery: { requestSupportRecovery: boolean };
  SupportLink: { supportLink: { uid: string; firstName: string; expiresAt: string } | null };
  ConfirmSupportRecovery: { confirmSupportRecovery: { caseId: string; statusToken: string; earliestAt: string } };
  SupportRequestStatus: { supportRequestStatus: SupportRequestStatus | null };
  IndicativeRate: { indicativeRate: IndicativeRate | null };
  SandboxCatalog: { sandboxCatalog: SandboxCatalog; demoBalance: Balance };
  SandboxQuote: { sandboxQuote: SandboxQuote };
  SandboxSubmit: { sandboxSubmit: SandboxReceipt };
  SandboxOp: { sandboxOp: SandboxReceipt | null };
  SandboxOps: { sandboxOps: SandboxReceipt[] };
  Deposits: { deposits: DepositInstructions[] };
  Withdrawals: { withdrawals: WithdrawalView[] };
  Notifications: { notifications: NotificationView[] };
  MarkNotificationsRead: { markNotificationsRead: number };
  MerchantInvoices: { merchantInvoices: MerchantInvoice[] };
  CreateInvoice: { createInvoice: CreatedInvoice };
  InvoicePayOptions: { invoicePayOptions: DepositOption[] };
  StartInvoicePayment: { startInvoicePayment: InvoicePayment };
  InvoicePayment: { invoicePayment: InvoicePayment | null };
  Security: { devices: DeviceView[]; recoveryKit: RecoveryKitStatus; recovery: RecoveryView | null; spendingLimit: SpendingLimit };
  Recovery: { recovery: RecoveryView | null };
  PrepareLimitChange: { prepareLimitChange: AccountCall };
  RequestLimitRaise: { requestLimitRaise: AccountCall };
  SubmitAccountCall: { submitAccountCall: AccountCall };
  AccountCall: { accountCall: AccountCall | null };
  TokensToEnable: { tokensToEnable: string[] };
  PrepareTokenEnable: { prepareTokenEnable: AccountCall };
}

export interface OperationVariables {
  Me: undefined;
  SetupStatus: undefined;
  AccountNameAvailability: { name: string };
  CreateAccount: { input: CreateAccountInput };
  RegisterProfile: { input: RegisterProfileInput };
  RegisterDevice: { publicKey: string };
  RegisterRecoveryKit: { kitPublicKey: string; devicePublicKey: string; deviceSignature: string };
  SignOutEverywhere: undefined;
  BeginViewOnlySession: undefined;
  AccountEvents: undefined;
  Wallet: undefined;
  SpendingLimit: undefined;
  LocalBalance: undefined;
  Activity: { first: number; before?: string | null };
  Transaction: { id: string };
  Recipient: { query: string };
  PrepareTransfer: { input: { amount: string; toAccount?: string; toHandle?: string; toPhone?: string } };
  Invoice: { invoiceId: string };
  PrepareInvoicePayment: { invoiceId: string };
  RequestCosign: { opId: string; deviceSignature: string };
  BuildDelegate: { input: { opId?: string; callId?: string; cancelRecovery?: boolean; publicKey: string } };
  SubmitSignedOp: { opId: string; signedDelegate: string; idempotencyKey: string };
  Op: { opId: string };
  Receive: undefined;
  QuoteDeposit: { input: DepositInput };
  StartDeposit: { input: DepositInput };
  Deposit: { id: string };
  WithdrawalOptions: undefined;
  QuoteWithdrawal: { input: WithdrawalInput };
  PrepareWithdrawal: { input: WithdrawalInput };
  Withdrawal: { id: string };
  BalanceChanged: undefined;
  TransactionUpdated: undefined;
  DepositUpdated: undefined;
  RemittanceCorridors: undefined;
  CancelRecoveryCall: undefined;
  CancelRecovery: { signedDelegate: string };
  StartRecovery: { newPublicKey: string; kitSignature?: string | null };
  ConfirmPhone: undefined;
  SupportCase: undefined;
  OpenSupportRecovery: { newPublicKey: string };
  CancelSupportRecovery: undefined;
  RequestSupportRecovery: { email: string; newPhone: string };
  SupportLink: { token: string };
  ConfirmSupportRecovery: { token: string; newPublicKey: string };
  SupportRequestStatus: { caseId: string; statusToken: string };
  IndicativeRate: undefined;
  SandboxCatalog: undefined;
  SandboxQuote: { input: SandboxRequestInput };
  SandboxSubmit: { input: SandboxRequestInput };
  SandboxOp: { id: string };
  SandboxOps: { first: number };
  Deposits: { first: number };
  Withdrawals: { first: number };
  Notifications: { first: number };
  MarkNotificationsRead: { upToId: string };
  MerchantInvoices: { first: number; before?: string | null };
  CreateInvoice: { input: { amount: string; expiresInMinutes: number; reference?: string | null } };
  InvoicePayOptions: undefined;
  StartInvoicePayment: { input: { invoiceId: string; origin: string; refundAddress: string } };
  InvoicePayment: { paymentId: string };
  Security: undefined;
  Recovery: undefined;
  PrepareLimitChange: { newLimit: string };
  RequestLimitRaise: { newLimit: string };
  SubmitAccountCall: { callId: string; signedDelegate: string };
  AccountCall: { callId: string };
  TokensToEnable: undefined;
  PrepareTokenEnable: { token: string };
}

export type OperationName = keyof OperationResults;
