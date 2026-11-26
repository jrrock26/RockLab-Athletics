// The plans a school can be on.
//
// This mirrors PLAN_LIMITS in functions/index.js deliberately: the server decides
// what a plan allows, and this copy exists only so the billing page cannot promise
// something the backend will not honour. Change both together.
//
// `price` is null until a Stripe price exists for the tier. The page reads that as
// "pricing on request" rather than inventing a number — checkout maps a plan to
// STRIPE_PRICE_<PLAN>, so a tier with no env var cannot be bought yet.
export const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    cadence: 'always',
    blurb: 'Start a team without talking to anyone.',
    teams: 1,
    reels: 1,
    storage: '1 GB',
  },
  {
    id: 'team',
    name: 'Team',
    price: null,
    cadence: 'per month',
    blurb: 'One team, full film and stats.',
    teams: 1,
    reels: 10,
    storage: '25 GB',
  },
  {
    id: 'school',
    name: 'School',
    price: null,
    cadence: 'per year',
    blurb: 'A whole athletic department, every sport.',
    teams: 40,
    reels: 200,
    storage: '250 GB',
  },
  {
    id: 'district',
    name: 'District',
    price: null,
    cadence: 'per year',
    blurb: 'Every school in the district, one bill.',
    teams: 500,
    reels: 2000,
    storage: '2 TB',
  },
];

/// Shown wherever a tier has no Stripe price attached yet.
export const PRICE_ON_REQUEST = 'Pricing on request';
