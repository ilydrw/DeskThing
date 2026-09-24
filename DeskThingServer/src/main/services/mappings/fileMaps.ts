import { ButtonMapping, Profile } from '@deskthing/types'
import { MappingStructure, MappingFileStructure } from '@shared/types'
import { defaultData } from '@server/static/defaultMapping'
import Logger from '@server/utils/logger'
import { readFromFile, writeToFile } from '@server/services/files/fileService'
import { isValidButtonMapping, isValidFileStructure, isValidMappingStructure } from './mapsValidation'
import path from 'node:path'

const MAPPINGS_FILE = path.join('mappings', 'mappings.json')

const validateMappingFile = (value: unknown): void => {
  isValidFileStructure(value)
  if (value.version !== defaultData.version) throw new Error('Unsupported mappings version')
}

export const loadMappings = async (): Promise<MappingStructure> => {
  const data = await readFromFile<MappingFileStructure>(MAPPINGS_FILE, validateMappingFile)
  if (!data) return structuredClone(defaultData)

  const entries = await Promise.all(Object.values(data.profiles).map(async (profile) => {
    const mapping = await readFromFile<ButtonMapping>(
      path.join('mappings', profile.id + '.json'), isValidButtonMapping
    )
    return mapping && mapping.id === profile.id ? [profile.id, mapping] as const : undefined
  }))
  const profiles = {
    default: structuredClone(defaultData.profiles.default),
    ...Object.fromEntries(entries.filter((entry) => entry !== undefined))
  }
  const result: MappingStructure = {
    ...data,
    profiles,
    selected_profile: profiles[data.selected_profile.id] ?? profiles.default
  }
  await isValidMappingStructure(result)
  return result
}

const saveProfile = async (profile: ButtonMapping): Promise<Profile> => {
  isValidButtonMapping(profile)
  await writeToFile(profile, path.join('mappings', profile.id + '.json'))
  const { mapping: _mapping, ...metadata } = profile
  return metadata
}

export const saveMappings = async (mapping: MappingStructure): Promise<void> => {
  const snapshot = structuredClone(mapping)
  await isValidMappingStructure(snapshot)
  // Publish the index only after every referenced profile has been saved.
  const profiles = Object.fromEntries(await Promise.all(
    Object.entries(snapshot.profiles).map(async ([key, profile]) => [key, await saveProfile(profile)])
  ))
  await writeToFile({ ...snapshot, profiles }, MAPPINGS_FILE)
}

export const exportProfile = async (profile: ButtonMapping, filePath: string): Promise<void> => {
  isValidButtonMapping(profile)
  await writeToFile(profile, filePath)
}

export const importProfile = async (
  filePath: string,
  profileName: string
): Promise<ButtonMapping | void> => {
  const profile = await readFromFile<ButtonMapping>(filePath, isValidButtonMapping)
  if (!profile) {
    Logger.warn('Unable to import missing or invalid mapping profile ' + profileName, {
      source: 'fileMaps', function: 'importProfile'
    })
  }
  return profile
}
