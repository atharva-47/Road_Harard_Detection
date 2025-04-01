import os

def process_files(folder_path, output_file):
    if not os.path.exists(folder_path):
        print("Folder does not exist.")
        return
    
    allowed_extensions = {'.txt', '.jsx', '.js', '.html', '.py'}
    
    with open(output_file, 'w', encoding='utf-8') as out_file:
        for filename in os.listdir(folder_path):
            file_path = os.path.join(folder_path, filename)
            file_extension = os.path.splitext(filename)[1]
            
            if os.path.isfile(file_path) and file_extension in allowed_extensions:
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as file:
                    content = file.read()
                    
                out_file.write(f"File Name: {filename}\n\n")
                out_file.write(content + "\n\n")
                
                print(f"Processed: {filename}")

if __name__ == "__main__":
    folder_path = input("Enter the folder path: ")
    output_file = os.path.join(folder_path, "merged_output.txt")
    process_files(folder_path, output_file)
