import { AppReleaseFile01111, ClientReleaseFile01111 } from '@shared/types'
import { getServiceConfig } from '@server/config/serviceConfig'
import { GitRepoUrl } from '@deskthing/types'

export const latestAppReleaseVersion = '0.11.11'

const { appCatalogRepository, clientCatalogRepository } = getServiceConfig()

export const appsRepo: GitRepoUrl | '' = appCatalogRepository
  ? (appCatalogRepository as GitRepoUrl)
  : ''
export const defaultAppLatestJSONFallback: AppReleaseFile01111 = {
  version: '0.11.11',
  type: 'app',
  repositories: appsRepo ? [appsRepo] : [],
  releases: [],
  timestamp: 0
}

export const latestClientReleaseVersion = '0.11.11'

export const clientRepo: GitRepoUrl | '' = clientCatalogRepository
  ? (clientCatalogRepository as GitRepoUrl)
  : ''
export const defaultClientLatestJSONFallback: ClientReleaseFile01111 = {
  version: '0.11.11',
  type: 'client',
  repositories: clientRepo ? [clientRepo] : [],
  releases: [],
  timestamp: 0
}
