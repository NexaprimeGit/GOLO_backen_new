export const KAFKA_TOPICS = {
  // Ad Commands (Requests)
  AD_CREATE: 'ad.create',
  AD_UPDATE: 'ad.update',
  AD_DELETE: 'ad.delete',
  AD_GET: 'ad.get',
  AD_GET_BY_CATEGORY: 'ad.get.by.category',
  AD_GET_BY_USER: 'ad.get.by.user',
  AD_SEARCH: 'ad.search',
  AD_GET_NEARBY: 'ad.get.nearby',
  
  // Ad Events (Responses/Notifications)
  AD_CREATED: 'ad.created',
  AD_UPDATED: 'ad.updated',
  AD_DELETED: 'ad.deleted',
  AD_VIEWED: 'ad.viewed',
  AD_EXPIRED: 'ad.expired',
  AD_PROMOTED: 'ad.promoted',
  
  // Responses
  AD_RESPONSE: 'ad.response',
  AD_ERROR: 'ad.error',
  
  // Dead Letter Queue
  AD_DLQ: 'ad.dlq',


  // User Events
  USER_REGISTERED: 'user.registered',
  USER_LOGGED_IN: 'user.logged.in',
  USER_LOGGED_OUT: 'user.logged.out',
  USER_UPDATED: 'user.updated',
  USER_DELETED: 'user.deleted',
  
  // Ad-User integration
  USER_ADS_FETCHED: 'user.ads.fetched',
  USER_ADS_CREATED: 'user.ads.created',

};