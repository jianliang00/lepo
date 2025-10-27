require 'find'

def scan_auto_register(pod_name, root_dir)
  auto_register_regex = /AUTO_REGISTER\(\s*"(.*?)"\s*\)/
  results = []
  Find.find(root_dir) do |path|
    next unless File.file?(path)
    File.foreach(path).with_index do |line, idx|
      if match = line.match(auto_register_regex)
        file_name = File.basename(path)
        module_name = match[1]
        results << {
          pod_name: pod_name,
          file_name: file_name,
          module_name: module_name
        }
      end
    end
  end
  results
end

def generate_module_provider_file(results, output_file)
  # Fixed header
  header = <<~HEREDOC
    #import <Lynx/LynxConfig.h>
    #import "ModuleProvider.h"
  HEREDOC
  # Generate import statements and remove duplicates
  import_lines = results.map do |item|
    %Q{#import <#{item[:pod_name]}/#{item[:file_name]}>}
  end.uniq
  # Fixed implementation part
  impl_header = <<~HEREDOC
    @implementation ModuleProvider
    -(void) setupConfig:(LynxConfig *)config {
  HEREDOC
  # Generate registerModule statements
  register_lines = results.map do |item|
    %Q{    [config registerModule:#{item[:module_name]}.class];}
  end
  # Fixed footer
  impl_footer = <<~HEREDOC
    }
    @end
  HEREDOC
  # Concatenate all contents
  file_content = [
    header,
    import_lines.join("\n"),
    impl_header,
    register_lines.join("\n"),
    impl_footer
  ].join("\n")
  # Write to file
  File.write(output_file, file_content)
end

def find_and_add_lepo_pods
  node_modules_path = File.expand_path('../node_modules', __dir__)
  unless Dir.exist?(node_modules_path)
    puts "⚠️  ../node_modules directory does not exist"
    return
  end

  results = []

  Dir.children(node_modules_path).each do |dir_name|
    dir_path = File.join(node_modules_path, dir_name)
    next unless File.directory?(dir_path)

    ext_json_path = File.join(dir_path, 'lynx.ext.json')
    pkg_json_path = File.join(dir_path, 'package.json')
    next unless File.exist?(ext_json_path) && File.exist?(pkg_json_path)

    begin
      ext_config = JSON.parse(File.read(ext_json_path))
      pod_name = ext_config['platforms']['ios']['componentName']
      
      if pod_name.nil? || pod_name.empty?
        puts "⚠️  Found lynx.ext.json in #{dir_name}, but missing name field"
        next
      end
      pod_file_path = File.join(dir_path, 'ios')
      # Add Pod dependency
      pod pod_name, :path => pod_file_path
      puts "✅ Added Pod: #{pod_name} (Path: #{pod_file_path})"
      results = results + scan_auto_register(pod_name, pod_file_path)
      
    rescue JSON::ParserError => e
      puts "⚠️  Failed to parse #{ext_json_path}: #{e.message}"
    rescue => e
      puts "⚠️  Error occurred while processing #{dir_name}: #{e.message}"
    end
  end
  generate_module_provider_file(results, "{{appName}}/ModuleProvider.m")
end
