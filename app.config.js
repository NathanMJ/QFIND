export default ({ config }) => {
  return {
    ...config,
    plugins: [...(config.plugins ?? []), "expo-font"],
    ios: {
      ...config.ios,
      infoPlist: {
        ...(config.ios?.infoPlist ?? {}),
        NSLocationWhenInUseUsageDescription:
          config.ios?.infoPlist?.NSLocationWhenInUseUsageDescription ??
          "QFind uses your location to show shops and products near you.",
        NSPhotoLibraryUsageDescription:
          config.ios?.infoPlist?.NSPhotoLibraryUsageDescription ??
          "QFind needs access to your photo library to upload product and shop photos.",
        NSCameraUsageDescription:
          config.ios?.infoPlist?.NSCameraUsageDescription ??
          "QFind needs camera access to take product and shop photos.",
        ITSAppUsesNonExemptEncryption:
          config.ios?.infoPlist?.ITSAppUsesNonExemptEncryption ?? false,
      },
      config: {
        ...config.ios?.config,
        googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY
      }
    },
    android: {
      ...config.android,
      config: {
        ...config.android?.config,
        googleMaps: {
          ...config.android?.config?.googleMaps,
          apiKey: process.env.GOOGLE_MAPS_API_KEY
        }
      }
    }
  };
};
