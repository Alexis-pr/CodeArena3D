export const environment = {
  production: true,
  // En producción, Nginx sirve el frontend y proxia /socket.io/ hacia el backend bajo el mismo dominio
  serverUrl: '',
};
