import { createApp } from "./app";
import { logger } from "./logger";

const PORT = parseInt(process.env.PORT || "3001", 10);

const app = createApp();

const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");
  server.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  logger.info("SIGINT received, shutting down gracefully");
  server.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });
});
