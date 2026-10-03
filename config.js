export const CONFIG = {
  origin: 'GRU',
  destination: 'YVR',
  adults: 1,
  market: 'BR',
  airlines: ['AC'],
  maxStops: 2,
  maxPriceBRL: 7000,
  trips: [
    { out: '2027-02-16', ret: '2027-03-02', priority: true },
    { out: '2027-02-01', ret: '2027-02-14' },
  ],
  blockedDate: '2027-02-15',
  allowLandOnBlockedDate: true,
  dropAlert: 0.05,
  usAirports: [
    'JFK','EWR','LGA','ORD','MDW','ATL','MIA','FLL','IAD','DCA','BOS',
    'DFW','DAL','LAX','SFO','SEA','DEN','IAH','HOU','MCO','PHL','CLT',
    'DTW','MSP','PHX','LAS','SLC','PDX','SAN','TPA','BWI','STL','MCI',
    'CLE','PIT','CVG','RDU','AUS','SJC','OAK','HNL','ANC','MSY',
  ],
};
