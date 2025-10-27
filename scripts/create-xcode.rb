require 'xcodeproj'

project_name = ARGV[0]
project_dir  = ARGV[1] 
project_path = "#{project_dir}/#{project_name}"
target_name = project_name
language = :swift


Dir.mkdir(project_path) unless Dir.exist?(project_path)
Dir.chdir(project_dir)


project = Xcodeproj::Project.new("#{project_name}.xcodeproj")

target = project.new_target(:application, target_name, :ios, nil, nil, language)


Dir.mkdir("#{project_name}") unless Dir.exist?("#{project_name}")
Dir.mkdir("#{project_name}/Resources") unless Dir.exist?("#{project_name}/Resources")

# add sources

app_delegate = project.new_file("#{project_name}/AppDelegate.swift")

view_controller = project.new_file("#{project_name}/ViewController.swift")

lynx_provider = project.new_file("#{project_name}/#{project_name}LynxProvider.swift")

scene_delegate = project.new_file("#{project_name}/SceneDelegate.swift")

module_provider_header = project.new_file("#{project_name}/ModuleProvider.h")

module_provider_content = project.new_file("#{project_name}/ModuleProvider.m")

generic_resource_fetcher = project.new_file("#{project_name}/#{project_name}LynxGenericResourceFetcher.swift")

target.add_file_references([app_delegate, view_controller, lynx_provider, scene_delegate, module_provider_header, module_provider_content, generic_resource_fetcher])


main_group = project.main_group
base_group = main_group.find_subpath('Base.lproj', true)
base_group.set_source_tree('SOURCE_ROOT')


# storyBorard 
main_storyboard_path = File.join("#{project_name}", "Base.lproj", "Main.storyboard")
main_storyboard_ref = base_group.new_reference(main_storyboard_path)
launch_screen_storyboard_path = File.join("#{project_name}", "Base.lproj", "LaunchScreen.storyboard")
launch_screen_storyboard_ref = base_group.new_reference(launch_screen_storyboard_path)
main_bundle_path = File.join("#{project_name}", "Resources", "main.lynx.bundle")
main_bundle_ref = main_group.new_reference(main_bundle_path)
target = project.targets.first
target.add_resources([main_storyboard_ref, launch_screen_storyboard_ref, main_bundle_ref])


# add Info.plist
info_plist_path = "#{project_name}/Info.plist"

bridging_file = "#{project_name}/#{project_name}-Bridging-Header.h"


target.build_configurations.each do |config|
  config.build_settings["INFOPLIST_FILE"] = info_plist_path
  config.build_settings["SWIFT_OBJC_BRIDGING_HEADER"] = bridging_file
  config.build_settings["ENABLE_USER_SCRIPT_SANDBOXING"] = "NO"
  config.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = "#{project_name}"
  config.build_settings['UIMainStoryboardFile'] = 'Main' 
  config.build_settings['UILaunchStoryboardName'] = 'LaunchScreen'
  config.build_settings['MARKETING_VERSION'] = '1.0'
end


project.save

puts "Create Xcode project: #{project_name}"