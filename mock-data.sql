-- USE your database name here (replace 'ccf_db' if yours is named differently in your .env)
USE ccf_db;

-- 1. Insert Mock Devices (GPUs)
INSERT INTO devices (resource_id, gpu_number, resource_type, ip_address, username, password, credential_active, status) VALUES
('DGX-100', 'GPU-0', 'Server', '192.168.1.10', 'admin', 'pass123', 1, 'Available'),
('DGX-100', 'GPU-1', 'Server', '192.168.1.11', 'admin', 'pass123', 1, 'Allocated'),
('DGX-100', 'GPU-2', 'Server', '192.168.1.12', 'admin', 'pass123', 1, 'Under Maintenance'),
('HPZ8-1', 'GPU-0', 'Workstation', '192.168.1.20', 'work_user', 'workpass', 1, 'Available'),
('HPZ8-1', 'GPU-1', 'Workstation', '192.168.1.21', 'work_user', 'workpass', 1, 'Allocated'),
('RTX-SERVER', 'GPU-0', 'Server', '192.168.1.30', 'root', 'rootpass', 0, 'Available');

-- 2. Insert Mock Requests
INSERT INTO requests (email, full_name, srn, department, contact_number, number_of_days, applied_on, status) VALUES
('alice@student.kle.edu', 'Alice Smith', '01FE22BCS001', 'Computer Science', '9876543210', 7, DATE_SUB(NOW(), INTERVAL 2 DAY), 'Pending'),
('bob@student.kle.edu', 'Bob Johnson', '01FE22BCS002', 'Artificial Intelligence', '9876543211', 14, DATE_SUB(NOW(), INTERVAL 1 DAY), 'Pending'),
('charlie@student.kle.edu', 'Charlie Brown', '01FE22BEC003', 'Electronics', '9876543212', 3, DATE_SUB(NOW(), INTERVAL 5 DAY), 'Allocated'),
('david@student.kle.edu', 'David Wilson', '01FE22BME004', 'Mechanical', '9876543213', 5, DATE_SUB(NOW(), INTERVAL 10 DAY), 'Rejected'),
('eve@student.kle.edu', 'Eve Davis', '01FE22BCS005', 'Computer Science', '9876543214', 10, DATE_SUB(NOW(), INTERVAL 15 DAY), 'Allocated');

-- 3. Insert Mock Allocations (Mixing Past, Present, and Future)
-- Allocation 1: ACTIVE NOW (Device ID 2)
INSERT INTO allocations (request_id, device_id, username, password, start_date, end_date) VALUES
(3, 2, 'student_charlie', 'temp_pass_1', DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_ADD(NOW(), INTERVAL 2 DAY));

-- Allocation 2: HISTORY / COMPLETED (Device ID 1 - currently available again)
INSERT INTO allocations (request_id, device_id, username, password, start_date, end_date) VALUES
(5, 1, 'student_eve', 'temp_pass_2', DATE_SUB(NOW(), INTERVAL 10 DAY), DATE_SUB(NOW(), INTERVAL 2 DAY));

-- Allocation 3: ACTIVE NOW (Device ID 5)
INSERT INTO allocations (request_id, device_id, username, password, start_date, end_date) VALUES
(5, 5, 'student_eve', 'temp_pass_3', DATE_SUB(NOW(), INTERVAL 0 DAY), DATE_ADD(NOW(), INTERVAL 5 DAY));

-- Allocation 4: FUTURE / UPCOMING (Device ID 1)
INSERT INTO allocations (request_id, device_id, username, password, start_date, end_date) VALUES
(2, 1, 'student_bob', 'temp_pass_4', DATE_ADD(NOW(), INTERVAL 3 DAY), DATE_ADD(NOW(), INTERVAL 17 DAY));
